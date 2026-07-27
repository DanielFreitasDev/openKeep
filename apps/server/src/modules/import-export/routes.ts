import { zId } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import * as svc from './service.js';

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
      const file = await req.file();
      if (!file) throw errors.badRequest('Expected a multipart zip file');
      const data = await file.toBuffer();
      if (data.length < 4 || data.readUInt32LE(0) !== 0x04034b50) {
        throw errors.unsupportedMediaType('Expected a zip archive');
      }
      const fileKey = storage.newKey('zip');
      await storage.write('exports', fileKey, data);
      const job = await svc.createJob(db, req.user.id, 'import', fileKey);
      await enqueue('import-takeout', job.id);
      return reply.status(202).send({ jobId: job.id });
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
