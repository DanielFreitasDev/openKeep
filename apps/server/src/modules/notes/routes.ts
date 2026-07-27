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
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import type { Storage } from '../../lib/storage.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zVersionParams = z.object({ id: zId, versionId: zId });

export function registerNotesRoutes(app: App, db: Db, storage?: Storage): void {
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
    async (req) => svc.listNotes(db, req.user.id, req.query.view),
  );

  app.post(
    '/api/notes',
    { ...auth, schema: { tags: ['notes'], body: zCreateNote, response: { 201: zFullNote } } },
    async (req, reply) => {
      const note = await svc.createNote(db, req.user.id, req.body);
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
    async (req) => svc.patchNoteContent(db, req.user.id, req.params.id, req.body),
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
    async (req) => svc.patchNoteState(db, req.user.id, req.params.id, req.body),
  );

  app.post(
    '/api/notes/:id/trash',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 200: zFullNote } } },
    async (req) => svc.trashNote(db, req.user.id, req.params.id),
  );

  app.post(
    '/api/notes/:id/restore',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 200: zFullNote } } },
    async (req) => svc.restoreNote(db, req.user.id, req.params.id),
  );

  app.delete(
    '/api/notes/:id',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.deleteNoteForever(db, req.user.id, req.params.id, storage);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/notes/trash/empty',
    { ...auth, schema: { tags: ['notes'], response: { 200: z.object({ deleted: z.number() }) } } },
    async (req) => ({ deleted: await svc.emptyTrash(db, req.user.id, storage) }),
  );

  app.post(
    '/api/notes/:id/copy',
    { ...auth, schema: { tags: ['notes'], params: zNoteParams, response: { 201: zFullNote } } },
    async (req, reply) => {
      const copy = await svc.copyNote(db, req.user.id, req.params.id, storage);
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
    async (req) => svc.convertNote(db, req.user.id, req.params.id, req.body.to),
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
    async (req) => svc.restoreVersion(db, req.user.id, req.params.id, req.params.versionId),
  );
}
