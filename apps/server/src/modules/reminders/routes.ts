import { zId, zPushSubscription, zReminder, zSetReminder, zSnoozeReminder } from '@openkeep/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { pushSubscriptions } from '../../db/schema/reminders.js';
import { errors } from '../../lib/errors.js';
import type { Realtime } from '../../realtime/registry.js';
import * as svc from './service.js';

const zNoteParams = z.object({ id: zId });

export function registerReminderRoutes(app: App, db: Db, config: Config, realtime: Realtime): void {
  const originOf = (req: { headers: Record<string, unknown> }) =>
    req.headers['x-client-id'] as string | undefined;
  const auth = { preHandler: [app.requireAuth] };

  app.put(
    '/api/notes/:id/reminder',
    {
      ...auth,
      schema: {
        tags: ['reminders'],
        params: zNoteParams,
        body: zSetReminder,
        response: { 200: zReminder },
      },
    },
    async (req) => {
      const reminder = await svc.setReminder(db, req.user.id, req.params.id, req.body);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'reminder.set', payload: { noteId: req.params.id, reminder } },
        originOf(req),
      );
      return reminder;
    },
  );

  app.delete(
    '/api/notes/:id/reminder',
    { ...auth, schema: { tags: ['reminders'], params: zNoteParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.deleteReminder(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'reminder.deleted', payload: { noteId: req.params.id } },
        originOf(req),
      );
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/api/notes/:id/reminder/snooze',
    {
      ...auth,
      schema: {
        tags: ['reminders'],
        params: zNoteParams,
        body: zSnoozeReminder,
        response: { 200: zReminder },
      },
    },
    async (req) => {
      const reminder = await svc.snoozeReminder(
        db,
        req.user.id,
        req.params.id,
        new Date(req.body.until),
      );
      realtime.publishToUsers(
        [req.user.id],
        { type: 'reminder.set', payload: { noteId: req.params.id, reminder } },
        originOf(req),
      );
      return reminder;
    },
  );

  app.post(
    '/api/notes/:id/reminder/dismiss',
    { ...auth, schema: { tags: ['reminders'], params: zNoteParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.dismissReminder(db, req.user.id, req.params.id);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'reminder.dismissed', payload: { noteId: req.params.id } },
        originOf(req),
      );
      return reply.status(204).send(null);
    },
  );

  // ---------------------------------------------------------------- push

  app.get(
    '/api/push/vapid-public-key',
    { ...auth, schema: { tags: ['push'], response: { 200: z.object({ key: z.string() }) } } },
    async () => {
      if (!config.VAPID_PUBLIC_KEY) throw errors.notFound('Web push is not configured');
      return { key: config.VAPID_PUBLIC_KEY };
    },
  );

  app.post(
    '/api/push/subscriptions',
    { ...auth, schema: { tags: ['push'], body: zPushSubscription, response: { 204: z.null() } } },
    async (req, reply) => {
      await db
        .insert(pushSubscriptions)
        .values({
          userId: req.user.id,
          endpoint: req.body.endpoint,
          p256dh: req.body.keys.p256dh,
          auth: req.body.keys.auth,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId: req.user.id, p256dh: req.body.keys.p256dh, auth: req.body.keys.auth },
        });
      return reply.status(204).send(null);
    },
  );

  app.delete(
    '/api/push/subscriptions',
    {
      ...auth,
      schema: {
        tags: ['push'],
        body: z.object({ endpoint: z.url().max(2000) }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, req.user.id),
            eq(pushSubscriptions.endpoint, req.body.endpoint),
          ),
        );
      return reply.status(204).send(null);
    },
  );
}
