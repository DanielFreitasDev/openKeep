import multipart from '@fastify/multipart';
import { LIMITS, zAttachment, zId } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { Realtime } from '../../realtime/registry.js';
import { memberIds } from '../../realtime/registry.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zAttachmentParams = z.object({ id: zId });

export async function registerAttachmentRoutes(
  app: App,
  db: Db,
  storage: Storage,
  realtime: Realtime,
): Promise<void> {
  const originOf = (req: { headers: Record<string, unknown> }) =>
    req.headers['x-client-id'] as string | undefined;
  await app.register(multipart, {
    limits: { fileSize: LIMITS.imageMaxBytes, files: 1, fields: 2 },
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
      const attachment = await svc.uploadImage(db, storage, req.user.id, req.params.id, data);
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        { type: 'attachment.added', payload: { noteId: req.params.id, attachment } },
        originOf(req),
      );
      return reply.status(201).send(attachment);
    },
  );

  app.get(
    '/api/attachments/:id/file',
    { preHandler: [app.requireAuth], schema: { tags: ['attachments'], params: zAttachmentParams } },
    async (req, reply) => {
      const { stream, mime } = await svc.openAttachment(
        db,
        storage,
        req.user.id,
        req.params.id,
        'file',
      );
      return reply
        .header('content-type', mime)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .send(stream);
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
          await memberIds(db, noteId),
          { type: 'attachment.removed', payload: { noteId, attachmentId: req.params.id } },
          originOf(req),
        );
      }
      return reply.status(204).send(null);
    },
  );
}
