import { zCreateLabel, zId, zLabel, zRenameLabel } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import * as svc from './service.js';

const zLabelParams = z.object({ id: zId });
const zNoteLabelParams = z.object({ id: zId, labelId: zId });

export function registerLabelRoutes(app: App, db: Db): void {
  const auth = { preHandler: [app.requireAuth] };

  app.get(
    '/api/labels',
    { ...auth, schema: { tags: ['labels'], response: { 200: z.array(zLabel) } } },
    async (req) => svc.listLabels(db, req.user.id),
  );

  app.post(
    '/api/labels',
    { ...auth, schema: { tags: ['labels'], body: zCreateLabel, response: { 201: zLabel } } },
    async (req, reply) =>
      reply.status(201).send(await svc.createLabel(db, req.user.id, req.body.name)),
  );

  app.patch(
    '/api/labels/:id',
    {
      ...auth,
      schema: {
        tags: ['labels'],
        params: zLabelParams,
        body: zRenameLabel,
        response: { 200: zLabel },
      },
    },
    async (req) => svc.renameLabel(db, req.user.id, req.params.id, req.body.name),
  );

  app.delete(
    '/api/labels/:id',
    { ...auth, schema: { tags: ['labels'], params: zLabelParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.deleteLabel(db, req.user.id, req.params.id);
      return reply.status(204).send(null);
    },
  );

  app.put(
    '/api/notes/:id/labels/:labelId',
    {
      ...auth,
      schema: { tags: ['labels'], params: zNoteLabelParams, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await svc.addLabelToNote(db, req.user.id, req.params.id, req.params.labelId);
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/api/notes/:id/labels/:labelId',
    {
      ...auth,
      schema: { tags: ['labels'], params: zNoteLabelParams, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await svc.removeLabelFromNote(db, req.user.id, req.params.id, req.params.labelId);
      return reply.status(204).send(null);
    },
  );
}
