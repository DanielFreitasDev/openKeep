import { zCalendarFeed } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import * as svc from './service.js';

/** Base64url of 24 bytes — the only shape the feed route will look up. */
const zFeedToken = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export function registerCalendarRoutes(app: App, db: Db, config: Config): void {
  const auth = { preHandler: [app.requireAuth] };
  const urlFor = (token: string | null) =>
    token === null ? null : new URL(`/api/calendar/${token}.ics`, config.APP_URL).toString();

  app.get(
    '/api/calendar/token',
    { ...auth, schema: { tags: ['reminders'], response: { 200: zCalendarFeed } } },
    async (req) => ({ url: urlFor(await svc.getCalendarToken(db, req.user.id)) }),
  );

  app.post(
    '/api/calendar/token',
    { ...auth, schema: { tags: ['reminders'], response: { 200: zCalendarFeed } } },
    async (req) => ({ url: urlFor(await svc.rotateCalendarToken(db, req.user.id)) }),
  );

  app.delete(
    '/api/calendar/token',
    { ...auth, schema: { tags: ['reminders'], response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.revokeCalendarToken(db, req.user.id);
      return reply.status(204).send(null);
    },
  );

  /**
   * The feed itself: no session, because a calendar client has none — the
   * token in the path IS the credential. Rate limited like any other
   * unauthenticated surface, and never cached by a shared proxy.
   */
  app.get(
    '/api/calendar/:token.ics',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['reminders'],
        description: 'iCalendar feed of the reminders belonging to the token holder.',
        params: z.object({ token: zFeedToken }),
      },
    },
    async (req, reply) => {
      const userId = await svc.userIdForCalendarToken(db, req.params.token);
      // Same 404 a bad path gets: no oracle for "this token used to exist".
      if (!userId) throw errors.notFound();
      const body = await svc.buildCalendarFeed(db, userId, config.APP_URL, new Date());
      return reply
        .type('text/calendar; charset=utf-8')
        .header('cache-control', 'private, max-age=300')
        .header('content-disposition', 'inline; filename="openkeep.ics"')
        .send(body);
    },
  );
}
