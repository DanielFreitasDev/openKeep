import {
  zConvertNote,
  zCreateNote,
  zFullNote,
  zId,
  zListNotesQuery,
  zNoteContentResult,
  zNoteStateResult,
  zNoteVersionMeta,
  zPatchNoteContent,
  zPatchNoteState,
} from '@openkeep/shared';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { notes as notesTable } from '../../db/schema/notes.js';
import type { Storage } from '../../lib/storage.js';
import type { Realtime } from '../../realtime/registry.js';
import { memberIds } from '../../realtime/registry.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zVersionParams = z.object({ id: zId, versionId: zId });

export function registerNotesRoutes(app: App, db: Db, realtime: Realtime, storage?: Storage): void {
  const originOf = (req: { headers: Record<string, unknown> }) =>
    req.headers['x-client-id'] as string | undefined;
  const auth = { preHandler: [app.requireAuth] };

  app.get(
    '/api/notes',
    {
      ...auth,
      schema: {
        tags: ['notes'],
        querystring: zListNotesQuery,
        response: { 200: z.array(zFullNote) },
      },
    },
    async (req) => svc.listNotes(db, req.user.id, req.query.view, req.query.label),
  );

  app.get(
    '/api/notes/:id',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 200: zFullNote } } },
    async (req) => svc.getNote(db, req.user.id, req.params.id),
  );

  app.post(
    '/api/notes',
    { ...auth, schema: { tags: ['notes'], body: zCreateNote, response: { 201: zFullNote } } },
    async (req, reply) => {
      const note = await svc.createNote(db, req.user.id, req.body);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'note.added', payload: { note } },
        originOf(req),
      );
      return reply.status(201).send(note);
    },
  );

  app.patch(
    '/api/notes/:id',
    {
      ...auth,
      schema: {
        tags: ['notes'],
        params: zNoteParams,
        body: zPatchNoteContent,
        response: { 200: zNoteContentResult },
      },
    },
    async (req) => {
      const result = await svc.patchNoteContent(db, req.user.id, req.params.id, req.body);
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        { type: 'note.updated', payload: result },
        originOf(req),
      );
      return result;
    },
  );

  app.patch(
    '/api/notes/:id/state',
    {
      ...auth,
      schema: {
        tags: ['notes'],
        params: zNoteParams,
        body: zPatchNoteState,
        response: { 200: zNoteStateResult },
      },
    },
    async (req) => {
      const result = await svc.patchNoteState(db, req.user.id, req.params.id, req.body);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'note.state_changed', payload: result },
        originOf(req),
      );
      return result;
    },
  );

  app.post(
    '/api/notes/:id/trash',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 200: zFullNote } } },
    async (req) => {
      const note = await svc.trashNote(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        {
          type: 'note.trashed',
          payload: { id: note.id, trashedAt: note.trashedAt ?? new Date().toISOString() },
        },
        originOf(req),
      );
      return note;
    },
  );

  app.post(
    '/api/notes/:id/restore',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 200: zFullNote } } },
    async (req) => {
      const note = await svc.restoreNote(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        { type: 'note.restored', payload: { id: note.id } },
        originOf(req),
      );
      return note;
    },
  );

  app.delete(
    '/api/notes/:id',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 204: z.null() } } },
    async (req, reply) => {
      const members = await memberIds(db, req.params.id);
      await svc.deleteNoteForever(db, req.user.id, req.params.id, storage);
      realtime.publishToUsers(
        members,
        { type: 'note.removed', payload: { id: req.params.id, reason: 'deleted' } },
        originOf(req),
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/notes/trash/empty',
    { ...auth, schema: { tags: ['notes'], response: { 200: z.object({ deleted: z.number() }) } } },
    async (req) => {
      const trashedIds = (
        await db
          .select({ id: notesTable.id })
          .from(notesTable)
          .where(and(eq(notesTable.ownerId, req.user.id), isNotNull(notesTable.trashedAt)))
      ).map((r) => r.id);
      const memberMap = new Map<string, string[]>();
      for (const id of trashedIds) memberMap.set(id, await memberIds(db, id));
      const deleted = await svc.emptyTrash(db, req.user.id, storage);
      for (const [id, members] of memberMap) {
        realtime.publishToUsers(
          members,
          { type: 'note.removed', payload: { id, reason: 'deleted' } },
          originOf(req),
        );
      }
      return { deleted };
    },
  );

  app.post(
    '/api/notes/:id/copy',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 201: zFullNote } } },
    async (req, reply) => {
      const copy = await svc.copyNote(db, req.user.id, req.params.id, storage);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'note.added', payload: { note: copy } },
        originOf(req),
      );
      return reply.status(201).send(copy);
    },
  );

  app.post(
    '/api/notes/:id/convert',
    {
      ...auth,
      schema: {
        tags: ['notes'],
        params: zNoteParams,
        body: zConvertNote,
        response: { 200: zFullNote },
      },
    },
    async (req) => {
      const note = await svc.convertNote(db, req.user.id, req.params.id, req.body.to);
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        { type: 'note.converted', payload: { note } },
        originOf(req),
      );
      return note;
    },
  );

  app.get(
    '/api/notes/:id/versions',
    {
      ...auth,
      schema: {
        tags: ['versions'],
        params: zNoteParams,
        response: { 200: z.array(zNoteVersionMeta) },
      },
    },
    async (req) => svc.listVersions(db, req.user.id, req.params.id),
  );

  app.get(
    '/api/notes/:id/versions/:versionId/download',
    { ...auth, schema: { tags: ['versions'], params: zVersionParams } },
    async (req, reply) => {
      const { filename, content } = await svc.versionAsText(
        db,
        req.user.id,
        req.params.id,
        req.params.versionId,
      );
      return reply
        .header('content-type', 'text/plain; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(content);
    },
  );

  app.post(
    '/api/notes/:id/versions/:versionId/restore',
    {
      ...auth,
      schema: { tags: ['versions'], params: zVersionParams, response: { 200: zFullNote } },
    },
    async (req) => {
      const note = await svc.restoreVersion(db, req.user.id, req.params.id, req.params.versionId);
      realtime.publishToUsers(
        await memberIds(db, req.params.id),
        { type: 'note.converted', payload: { note } },
        originOf(req),
      );
      return note;
    },
  );
}
