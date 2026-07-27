import {
  zCreateItemInput,
  zId,
  zItemPatchResult,
  zItemsReplacedResult,
  zNoteItem,
  zPatchItemInput,
} from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zItemParams = z.object({ id: zId, itemId: zId });

export function registerItemRoutes(app: App, db: Db): void {
  const auth = { preHandler: [app.requireAuth] };

  app.post(
    '/api/notes/:id/items',
    {
      ...auth,
      schema: {
        tags: ['items'],
        params: zNoteParams,
        body: zCreateItemInput,
        response: { 201: zNoteItem },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await svc.createItem(db, req.user.id, req.params.id, req.body)),
  );

  app.patch(
    '/api/notes/:id/items/:itemId',
    {
      ...auth,
      schema: {
        tags: ['items'],
        params: zItemParams,
        body: zPatchItemInput,
        response: { 200: zItemPatchResult },
      },
    },
    async (req) => svc.patchItem(db, req.user.id, req.params.id, req.params.itemId, req.body),
  );

  app.delete(
    '/api/notes/:id/items/:itemId',
    { ...auth, schema: { tags: ['items'], params: zItemParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.deleteItem(db, req.user.id, req.params.id, req.params.itemId);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/notes/:id/uncheck-all',
    {
      ...auth,
      schema: { tags: ['items'], params: zNoteParams, response: { 200: zItemsReplacedResult } },
    },
    async (req) => svc.uncheckAll(db, req.user.id, req.params.id),
  );

  app.post(
    '/api/notes/:id/delete-checked',
    {
      ...auth,
      schema: { tags: ['items'], params: zNoteParams, response: { 200: zItemsReplacedResult } },
    },
    async (req) => svc.deleteChecked(db, req.user.id, req.params.id),
  );
}
