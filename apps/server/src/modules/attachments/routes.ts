import type { MultipartFile } from '@fastify/multipart';
import multipart from '@fastify/multipart';
import type { DrawingData } from '@openkeep/shared';
import { LIMITS, zAttachment, zDrawingData, zId } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { Realtime } from '../../realtime/registry.js';
import { contentAudience } from '../../realtime/registry.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zAttachmentParams = z.object({ id: zId });

/**
 * Drawing uploads are multipart: a `drawing` JSON field (sent before the file
 * so busboy has buffered it by the time the file part resolves) + the PNG
 * render as the file. Validated here — multipart bypasses the schema layer.
 */
async function readDrawingMultipart(req: {
  file: () => Promise<MultipartFile | undefined>;
}): Promise<{ file: Buffer; drawing: DrawingData }> {
  const part = await req.file();
  if (!part) throw errors.badRequest('Expected a multipart file field');
  const data = await part.toBuffer();
  const field = part.fields.drawing;
  const raw = field && !Array.isArray(field) && field.type === 'field' ? String(field.value) : null;
  if (!raw) throw errors.badRequest('Expected a drawing JSON field');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw errors.badRequest('Invalid drawing JSON');
  }
  const parsed = zDrawingData.safeParse(json);
  if (!parsed.success) throw errors.badRequest('Invalid drawing data');
  return { file: data, drawing: parsed.data };
}

export async function registerAttachmentRoutes(
  app: App,
  db: Db,
  storage: Storage,
  realtime: Realtime,
  config: Config,
): Promise<void> {
  const originOf = (req: { headers: Record<string, unknown> }) =>
    req.headers['x-client-id'] as string | undefined;
  // The account allowance every upload here is measured against (DECISIONS #33).
  const quota = { quotaBytes: config.storageQuotaBytes };
  await app.register(multipart, {
    limits: {
      fileSize: LIMITS.imageMaxBytes,
      files: 1,
      fields: 2,
      fieldSize: LIMITS.drawingDataMaxBytes,
    },
  });

  app.post(
    '/api/notes/:id/attachments',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['attachments'], params: zNoteParams, response: { 201: zAttachment } },
    },
    async (req, reply) => {
      const file = await req.file();
      if (!file) throw errors.badRequest('Expected a multipart file field');
      const data = await file.toBuffer();
      const attachment = await svc.uploadImage(
        db,
        storage,
        req.user.id,
        req.params.id,
        data,
        quota,
      );
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'attachment.added', payload: { noteId: req.params.id, attachment } },
        originOf(req),
      );
      return reply.status(201).send(attachment);
    },
  );

  app.post(
    '/api/notes/:id/audio',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['attachments'], params: zNoteParams, response: { 201: zAttachment } },
    },
    async (req, reply) => {
      // The plugin's global cap is the image one; audio is allowed to be
      // bigger, so this route raises it for its own request. Without the
      // override busboy would truncate a long recording at 10 MB and the
      // sniffer would then reject a file that was merely cut short.
      const file = await req.file({ limits: { fileSize: LIMITS.audioMaxBytes } });
      if (!file) throw errors.badRequest('Expected a multipart file field');
      const data = await file.toBuffer();
      const attachment = await svc.uploadAudio(
        db,
        storage,
        req.user.id,
        req.params.id,
        data,
        quota,
      );
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'attachment.added', payload: { noteId: req.params.id, attachment } },
        originOf(req),
      );
      return reply.status(201).send(attachment);
    },
  );

  app.post(
    '/api/notes/:id/files',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['attachments'],
        description:
          'Attach an arbitrary file (PDF, office document, archive, text). Magic bytes decide the container and the extension names the format.',
        params: zNoteParams,
        response: { 201: zAttachment },
      },
    },
    async (req, reply) => {
      // Like audio, files carry their own byte cap, and busboy has to be told
      // per request — otherwise it truncates and the sniffer then rejects a
      // file whose only problem was being cut short.
      const file = await req.file({ limits: { fileSize: LIMITS.fileMaxBytes } });
      if (!file) throw errors.badRequest('Expected a multipart file field');
      const data = await file.toBuffer();
      // The name arrives with the part; there is no separate field to trust.
      const attachment = await svc.uploadFile(
        db,
        storage,
        req.user.id,
        req.params.id,
        data,
        file.filename ?? '',
        quota,
      );
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'attachment.added', payload: { noteId: req.params.id, attachment } },
        originOf(req),
      );
      return reply.status(201).send(attachment);
    },
  );

  app.post(
    '/api/notes/:id/drawings',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['attachments'], params: zNoteParams, response: { 201: zAttachment } },
    },
    async (req, reply) => {
      const { file, drawing } = await readDrawingMultipart(req);
      const attachment = await svc.uploadDrawing(
        db,
        storage,
        req.user.id,
        req.params.id,
        file,
        drawing,
        quota,
      );
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'attachment.added', payload: { noteId: req.params.id, attachment } },
        originOf(req),
      );
      return reply.status(201).send(attachment);
    },
  );

  app.put(
    '/api/attachments/:id/drawing',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['attachments'], params: zAttachmentParams, response: { 200: zAttachment } },
    },
    async (req) => {
      const { file, drawing } = await readDrawingMultipart(req);
      const { attachment, noteId } = await svc.updateDrawing(
        db,
        storage,
        req.user.id,
        req.params.id,
        file,
        drawing,
        quota,
      );
      realtime.publishToUsers(
        await contentAudience(db, noteId),
        { type: 'attachment.updated', payload: { noteId, attachment } },
        originOf(req),
      );
      return attachment;
    },
  );

  app.get(
    '/api/attachments/:id/drawing',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['attachments'], params: zAttachmentParams, response: { 200: zDrawingData } },
    },
    async (req) => svc.getDrawingData(db, req.user.id, req.params.id),
  );

  app.get(
    '/api/attachments/:id/file',
    { preHandler: [app.requireAuth], schema: { tags: ['attachments'], params: zAttachmentParams } },
    async (req, reply) => {
      const { stream, mime, download } = await svc.openAttachment(
        db,
        storage,
        req.user.id,
        req.params.id,
        'file',
      );
      reply
        .header('content-type', mime)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff');
      // A file is downloaded, never rendered on our origin (DECISIONS #31).
      if (download) reply.header('content-disposition', svc.attachmentDisposition(download));
      return reply.send(stream);
    },
  );

  app.get(
    '/api/attachments/:id/thumb',
    { preHandler: [app.requireAuth], schema: { tags: ['attachments'], params: zAttachmentParams } },
    async (req, reply) => {
      const { stream, mime } = await svc.openAttachment(
        db,
        storage,
        req.user.id,
        req.params.id,
        'thumb',
      );
      return reply
        .header('content-type', mime)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .send(stream);
    },
  );

  app.delete(
    '/api/attachments/:id',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['attachments'], params: zAttachmentParams, response: { 204: z.null() } },
    },
    async (req, reply) => {
      const noteId = await svc.noteIdOfAttachment(db, req.user.id, req.params.id);
      await svc.deleteAttachment(db, storage, req.user.id, req.params.id);
      if (noteId) {
        realtime.publishToUsers(
          await contentAudience(db, noteId),
          { type: 'attachment.removed', payload: { noteId, attachmentId: req.params.id } },
          originOf(req),
        );
      }
      return reply.status(204).send(null);
    },
  );
}
