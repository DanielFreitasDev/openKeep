import { zCreateLabel, zId, zLabel, zPatchLabel } from '@openkeep/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { noteLabels } from '../../db/schema/labels.js';
import type { Realtime } from '../../realtime/registry.js';
import * as svc from './service.js';

const zLabelParams = z.object({ id: zId });
const zNoteLabelParams = z.object({ id: zId, labelId: zId });

export function registerLabelRoutes(app: App, db: Db, realtime: Realtime): void {
  const originOf = (req: { headers: Record<string, unknown> }) =>
    req.headers['x-client-id'] as string | undefined;

  const labelIdsOf = async (noteId: string, userId: string) =>
    (
      await db
        .select({ labelId: noteLabels.labelId })
        .from(noteLabels)
        .where(and(eq(noteLabels.noteId, noteId), eq(noteLabels.userId, userId)))
    ).map((r) => r.labelId);
  const auth = { preHandler: [app.requireAuth] };

  app.get(
    '/api/labels',
    { ...auth, schema: { tags: ['labels'], response: { 200: z.array(zLabel) } } },
    async (req) => svc.listLabels(db, req.user.id),
  );

  app.post(
    '/api/labels',
    { ...auth, schema: { tags: ['labels'], body: zCreateLabel, response: { 201: zLabel } } },
    async (req, reply) => {
      const label = await svc.createLabel(db, req.user.id, req.body.name);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'label.created', payload: { label } },
        originOf(req),
      );
      return reply.status(201).send(label);
    },
  );

  app.patch(
    '/api/labels/:id',
    {
      ...auth,
      schema: {
        tags: ['labels'],
        params: zLabelParams,
        body: zPatchLabel,
        response: { 200: zLabel },
      },
    },
    async (req) => {
      const label = await svc.patchLabel(db, req.user.id, req.params.id, req.body);
      realtime.publishToUsers(
        [req.user.id],
        // Still `label.renamed`: to every client this is "a label changed",
        // and the payload is the whole label either way.
        { type: 'label.renamed', payload: { label } },
        originOf(req),
      );
      return label;
    },
  );

  app.delete(
    '/api/labels/:id',
    { ...auth, schema: { tags: ['labels'], params: zLabelParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.deleteLabel(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'label.deleted', payload: { labelId: req.params.id } },
        originOf(req),
      );
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
      realtime.publishToUsers(
        [req.user.id],
        {
          type: 'note.labels_changed',
          payload: { id: req.params.id, labelIds: await labelIdsOf(req.params.id, req.user.id) },
        },
        originOf(req),
      );
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
      realtime.publishToUsers(
        [req.user.id],
        {
          type: 'note.labels_changed',
          payload: { id: req.params.id, labelIds: await labelIdsOf(req.params.id, req.user.id) },
        },
        originOf(req),
      );
      return reply.status(204).send(null);
    },
  );
}
