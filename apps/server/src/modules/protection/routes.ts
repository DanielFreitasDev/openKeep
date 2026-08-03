import { zProtectionStatus, zSetNotePin, zUnlockNotes } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { rejectPatAuth } from '../../plugins/auth.js';
import * as svc from './service.js';

/**
 * The reveal window for protected notes, and the PIN that opens it.
 *
 * Session-only on purpose (`rejectPatAuth`): an API token cannot be asked to
 * retype a password, so letting one unlock would turn "protected" into "hidden
 * from the browser". Protected notes stay invisible to the MCP server and to
 * every other agent holding a token — see docs/MCP.md.
 */
export function registerProtectionRoutes(app: App, db: Db): void {
  const auth = { preHandler: [app.requireAuth, rejectPatAuth] };

  app.get(
    '/api/protection',
    { ...auth, schema: { tags: ['protection'], response: { 200: zProtectionStatus } } },
    async (req) => svc.getStatus(db, req.user.id, req.sessionId),
  );

  app.post(
    '/api/protection/unlock',
    {
      ...auth,
      // Second line after the per-session attempt counter, which is the real
      // defence (five wrong answers cost five minutes). This one is per IP, so
      // it exists for the attacker spreading guesses across fresh sessions —
      // and has to stay clear of one person unlocking a few notes in a row.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['protection'],
        body: zUnlockNotes,
        response: { 200: z.object({ unlockedUntil: z.iso.datetime() }) },
      },
    },
    async (req) => {
      const until = await svc.unlockNotes(db, req.user.id, req.sessionId, req.body);
      return { unlockedUntil: until.toISOString() };
    },
  );

  app.post(
    '/api/protection/lock',
    { ...auth, schema: { tags: ['protection'], response: { 204: z.null() } } },
    async (req, reply) => {
      svc.lockNotes(req.sessionId);
      return reply.status(204).send(null);
    },
  );

  app.put(
    '/api/protection/pin',
    {
      ...auth,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { tags: ['protection'], body: zSetNotePin, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await svc.setNotePin(db, req.user.id, req.body);
      return reply.status(204).send(null);
    },
  );
}
