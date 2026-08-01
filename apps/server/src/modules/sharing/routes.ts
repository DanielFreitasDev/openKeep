import {
  zCollaborator,
  zCreateShareLink,
  zId,
  zInviteRole,
  zPublicNote,
  zShareLink,
} from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { Realtime } from '../../realtime/registry.js';
import { memberIds } from '../../realtime/registry.js';
import { attachmentDisposition } from '../attachments/service.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zMemberParams = z.object({ id: zId, userId: z.string() });

/** Base64url of 24 bytes — the only shape a public route will look up. */
const zShareToken = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export function registerSharingRoutes(
  app: App,
  db: Db,
  realtime: Realtime,
  config: Config,
  storage: Storage,
): void {
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

  /* --------------------------------------------------------------- *
   * Public read-only link
   * --------------------------------------------------------------- */

  const toDto = (row: svc.ShareLinkRow | null) => ({
    // `/s/<token>` is a page, not an API path: what the owner copies is what a
    // person opens, and the SPA route is the only thing that renders it.
    url: row === null ? null : new URL(`/s/${row.token}`, config.APP_URL).toString(),
    expiresAt: row?.expiresAt?.toISOString() ?? null,
  });

  app.get(
    '/api/notes/:id/share-link',
    {
      ...auth,
      schema: { tags: ['sharing'], params: zNoteParams, response: { 200: zShareLink } },
    },
    async (req) => toDto(await svc.getShareLink(db, req.user.id, req.params.id)),
  );

  app.post(
    '/api/notes/:id/share-link',
    {
      ...auth,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['sharing'],
        description: 'Create (or replace) the note’s public read-only link.',
        params: zNoteParams,
        body: zCreateShareLink,
        response: { 201: zShareLink },
      },
    },
    async (req, reply) => {
      const row = await svc.createShareLink(db, req.user.id, req.params.id, req.body.expiresInDays);
      return reply.status(201).send(toDto(row));
    },
  );

  app.delete(
    '/api/notes/:id/share-link',
    { ...auth, schema: { tags: ['sharing'], params: zNoteParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.revokeShareLink(db, req.user.id, req.params.id);
      return reply.status(204).send(null);
    },
  );

  /**
   * What a link holder reads. No session — the whole point is that there is no
   * account on the other end — so the token in the path is the credential, the
   * surface is rate limited like any anonymous one, and search engines are
   * told to stay away in the response itself as well as in robots.txt.
   */
  app.get(
    '/api/public/notes/:token',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['sharing'],
        description: 'The note behind a public link, as a reader sees it.',
        params: z.object({ token: zShareToken }),
        response: { 200: zPublicNote },
      },
    },
    async (req, reply) => {
      const note = await svc.publicNoteByToken(db, req.params.token);
      if (!note) throw errors.notFound();
      return reply
        .header('x-robots-tag', 'noindex, nofollow')
        .header('cache-control', 'private, no-store')
        .send(note);
    },
  );

  app.get(
    '/api/public/notes/:token/attachments/:attachmentId/:variant',
    {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: {
        tags: ['sharing'],
        description: 'Image, drawing, audio or file bytes of a publicly linked note.',
        params: z.object({
          token: zShareToken,
          attachmentId: zId,
          variant: z.enum(['file', 'thumb']),
        }),
      },
    },
    async (req, reply) => {
      const { stream, mime, download } = await svc.openPublicAttachment(
        db,
        storage,
        req.params.token,
        req.params.attachmentId,
        req.params.variant,
      );
      reply
        .header('content-type', mime)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .header('x-robots-tag', 'noindex, nofollow');
      // Same rule as the private route: a file downloads, it does not render.
      if (download) reply.header('content-disposition', attachmentDisposition(download));
      return reply.send(stream);
    },
  );
}
