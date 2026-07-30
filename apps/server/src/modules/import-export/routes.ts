import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { LIMITS, zId } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import * as svc from './service.js';

/** Loose `.md` uploads: generous per file, bounded per request. */
const MARKDOWN_FILE_MAX_BYTES = 2 * 1024 * 1024;
const MARKDOWN_FILES_MAX = 100;

const zJob = z.object({
  id: zId,
  kind: z.enum(['import', 'export']),
  status: z.enum(['pending', 'running', 'done', 'failed']),
  progress: z.number().int(),
  total: z.number().int(),
  error: z.string().nullable(),
  summary: z.string().nullable(),
  downloadReady: z.boolean(),
});

function toJobDto(job: svc.JobRow) {
  return {
    id: job.id,
    kind: job.kind as 'import' | 'export',
    status: job.status as 'pending' | 'running' | 'done' | 'failed',
    progress: job.progress,
    total: job.total,
    error: job.error,
    summary: job.summary,
    downloadReady: job.kind === 'export' && job.status === 'done' && job.fileKey !== null,
  };
}

export function registerImportExportRoutes(
  app: App,
  db: Db,
  storage: Storage,
  enqueue: (queue: 'import-takeout' | 'export-user-data', jobId: string) => Promise<void>,
): void {
  const auth = { preHandler: [app.requireAuth] };

  app.post(
    '/api/import/takeout',
    {
      ...auth,
      config: { rateLimit: { max: 3, timeWindow: '1 day' } },
      schema: { tags: ['import-export'], response: { 202: z.object({ jobId: zId }) } },
    },
    async (req, reply) => {
      // Takeout archives dwarf the shared image cap — stream to disk under a
      // dedicated limit instead of buffering through req.file()'s default.
      const file = await req.file({ limits: { fileSize: LIMITS.importZipMaxBytes } });
      if (!file) throw errors.badRequest('Expected a multipart zip file');
      const fileKey = storage.newKey('zip');
      const zipPath = storage.pathFor('exports', fileKey);
      try {
        await pipeline(file.file, fs.createWriteStream(zipPath));
        if (file.file.truncated) {
          throw errors.payloadTooLarge(
            `Import archives can be at most ${LIMITS.importZipMaxBytes / 1024 / 1024} MB`,
          );
        }
        const head = Buffer.alloc(4);
        const fd = await fsp.open(zipPath, 'r');
        try {
          await fd.read(head, 0, 4, 0);
        } finally {
          await fd.close();
        }
        if (head.readUInt32LE(0) !== 0x04034b50) {
          throw errors.unsupportedMediaType('Expected a zip archive');
        }
      } catch (err) {
        await storage.remove('exports', fileKey);
        throw err;
      }
      const job = await svc.createJob(db, req.user.id, 'import', fileKey);
      await enqueue('import-takeout', job.id);
      return reply.status(202).send({ jobId: job.id });
    },
  );

  app.post(
    '/api/import/markdown',
    {
      ...auth,
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      schema: {
        tags: ['import-export'],
        description:
          'Import `.md` files as notes (multipart, one part per file). A whole vault goes through /api/import/takeout as a zip instead — that endpoint reads markdown entries too.',
        response: {
          200: z.object({ imported: z.number().int(), skipped: z.number().int() }),
        },
      },
    },
    async (req) => {
      // Small batches run inline: markdown import is parsing plus inserts, so
      // the job machinery (and its polling UI) would only add latency here.
      const files: { fileName: string; text: string }[] = [];
      let oversized = false;
      const parts = req.files({
        limits: { fileSize: MARKDOWN_FILE_MAX_BYTES, files: MARKDOWN_FILES_MAX },
      });
      for await (const part of parts) {
        // Every part is drained even past the cap: abandoning the iterator
        // mid-stream leaves the request body unconsumed. An over-limit part
        // either throws or comes back truncated depending on the plugin's
        // configuration — both mean "skip this one and report it".
        let buffer: Buffer;
        try {
          buffer = await part.toBuffer();
        } catch {
          oversized = true;
          continue;
        }
        if (part.file.truncated) {
          oversized = true;
          continue;
        }
        if (files.length >= MARKDOWN_FILES_MAX) continue;
        if (!/\.(md|markdown|txt)$/i.test(part.filename)) continue;
        files.push({ fileName: part.filename, text: buffer.toString('utf8') });
      }
      if (files.length === 0) {
        throw errors.badRequest(
          oversized
            ? `Markdown files can be at most ${MARKDOWN_FILE_MAX_BYTES / 1024 / 1024} MB`
            : 'Expected one or more .md files',
        );
      }
      return svc.importMarkdownFiles(db, req.user.id, files);
    },
  );

  app.post(
    '/api/export',
    {
      ...auth,
      config: { rateLimit: { max: 5, timeWindow: '1 day' } },
      schema: { tags: ['import-export'], response: { 202: z.object({ jobId: zId }) } },
    },
    async (req, reply) => {
      const job = await svc.createJob(db, req.user.id, 'export');
      await enqueue('export-user-data', job.id);
      return reply.status(202).send({ jobId: job.id });
    },
  );

  app.get(
    '/api/jobs/:id',
    {
      ...auth,
      schema: { tags: ['import-export'], params: z.object({ id: zId }), response: { 200: zJob } },
    },
    async (req) => toJobDto(await svc.getJob(db, req.user.id, req.params.id)),
  );

  app.get(
    '/api/jobs/:id/download',
    { ...auth, schema: { tags: ['import-export'], params: z.object({ id: zId }) } },
    async (req, reply) => {
      const job = await svc.getJob(db, req.user.id, req.params.id);
      if (job.kind !== 'export' || job.status !== 'done' || !job.fileKey) {
        throw errors.notFound('Export is not ready');
      }
      if (!(await storage.exists('exports', job.fileKey))) {
        throw errors.notFound('Export has expired');
      }
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', 'attachment; filename="openkeep-export.zip"')
        .send(storage.createReadStream('exports', job.fileKey));
    },
  );
}
