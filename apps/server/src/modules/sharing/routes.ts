import { zCollaborator, zId, zInviteRole } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import type { Realtime } from '../../realtime/registry.js';
import { memberIds } from '../../realtime/registry.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zMemberParams = z.object({ id: zId, userId: z.string() });

export function registerSharingRoutes(app: App, db: Db, realtime: Realtime): void {
  const auth = { preHandler: [app.requireAuth] };

  app.get(
    '/api/notes/:id/collaborators',
    {
      ...auth,
      schema: { tags: ['sharing'], params: zNoteParams, response: { 200: z.array(zCollaborator) } },
    },
    async (req) => svc.listCollaborators(db, req.user.id, req.params.id),
  );

  app.post(
    '/api/notes/:id/collaborators',
    {
      ...auth,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['sharing'],
        params: zNoteParams,
        body: z.object({
          email: z.email().max(320),
          /** Omitted = the historical behaviour: full editing rights. */
          role: zInviteRole.default('collaborator'),
        }),
        response: { 201: zCollaborator },
      },
    },
    async (req, reply) => {
      const collaborator = await svc.addCollaborator(
        db,
        req.user.id,
        req.params.id,
        req.body.email,
        req.body.role,
      );
      const origin = req.headers['x-client-id'] as string | undefined;
      const members = await memberIds(db, req.params.id);
      realtime.publishToUsers(
        members.filter((m) => m !== collaborator.userId),
        { type: 'collaborator.added', payload: { noteId: req.params.id, collaborator } },
        origin,
      );
      // The new collaborator's devices learn about the whole note.
      const { assembleForUser } = await import('../notes/service.js');
      const note = await assembleForUser(db, collaborator.userId, req.params.id);
      if (note) {
        realtime.publishToUsers([collaborator.userId], {
          type: 'note.added',
          payload: { note },
        });
      }
      return reply.status(201).send(collaborator);
    },
  );

  app.patch(
    '/api/notes/:id/collaborators/:userId',
    {
      ...auth,
      schema: {
        tags: ['sharing'],
        params: zMemberParams,
        body: z.object({ role: zInviteRole }),
        response: { 200: zCollaborator },
      },
    },
    async (req) => {
      const collaborator = await svc.setCollaboratorRole(
        db,
        req.user.id,
        req.params.id,
        req.params.userId,
        req.body.role,
      );
      const origin = req.headers['x-client-id'] as string | undefined;
      // Everyone redraws the member list; the affected person's own tabs also
      // flip the note between editable and read-only off this one event.
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        {
          type: 'collaborator.role_changed',
          payload: {
            noteId: req.params.id,
            userId: collaborator.userId,
            role: collaborator.role,
          },
        },
        origin,
      );
      return collaborator;
    },
  );

  app.delete(
    '/api/notes/:id/collaborators/:userId',
    { ...auth, schema: { tags: ['sharing'], params: zMemberParams, response: { 204: z.null() } } },
    async (req, reply) => {
      const origin = req.headers['x-client-id'] as string | undefined;
      const remaining = (await memberIds(db, req.params.id)).filter((m) => m !== req.params.userId);
      const outcome = await svc.removeCollaborator(
        db,
        req.user.id,
        req.params.id,
        req.params.userId,
      );
      realtime.publishToUsers(
        remaining,
        {
          type: 'collaborator.removed',
          payload: { noteId: req.params.id, userId: req.params.userId },
        },
        origin,
      );
      realtime.publishToUsers([req.params.userId], {
        type: 'note.removed',
        payload: { id: req.params.id, reason: outcome === 'left' ? 'left' : 'unshared' },
      });
      return reply.status(204).send(null);
    },
  );
}
