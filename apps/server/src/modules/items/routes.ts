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
import type { Realtime } from '../../realtime/registry.js';
import { contentAudience } from '../../realtime/registry.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });
const zItemParams = z.object({ id: zId, itemId: zId });

export function registerItemRoutes(app: App, db: Db, realtime: Realtime): void {
  const originOf = (req: { headers: Record<string, unknown> }) =>
    req.headers['x-client-id'] as string | undefined;
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
    async (req, reply) => {
      const item = await svc.createItem(db, req.user.id, req.params.id, req.body);
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'item.added', payload: { noteId: req.params.id, item } },
        originOf(req),
      );
      return reply.status(201).send(item);
    },
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
    async (req) => {
      const result = await svc.patchItem(
        db,
        req.user.id,
        req.params.id,
        req.params.itemId,
        req.body,
      );
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        {
          type: 'item.updated',
          payload: { noteId: req.params.id, item: result.item, cascaded: result.cascaded },
        },
        originOf(req),
      );
      return result;
    },
  );

  app.delete(
    '/api/notes/:id/items/:itemId',
    { ...auth, schema: { tags: ['items'], params: zItemParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.deleteItem(db, req.user.id, req.params.id, req.params.itemId);
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'item.removed', payload: { noteId: req.params.id, itemId: req.params.itemId } },
        originOf(req),
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/notes/:id/uncheck-all',
    {
      ...auth,
      schema: { tags: ['items'], params: zNoteParams, response: { 200: zItemsReplacedResult } },
    },
    async (req) => {
      const result = await svc.uncheckAll(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'items.replaced', payload: result },
        originOf(req),
      );
      return result;
    },
  );

  app.post(
    '/api/notes/:id/delete-checked',
    {
      ...auth,
      schema: { tags: ['items'], params: zNoteParams, response: { 200: zItemsReplacedResult } },
    },
    async (req) => {
      const result = await svc.deleteChecked(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        await contentAudience(db, req.params.id),
        { type: 'items.replaced', payload: result },
        originOf(req),
      );
      return result;
    },
  );
}
