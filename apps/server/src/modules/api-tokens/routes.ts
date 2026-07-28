import { zApiToken, zApiTokenWithSecret, zCreateApiToken, zId } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { rejectPatAuth } from '../../plugins/auth.js';
import * as svc from './service.js';

const zTokenParams = z.object({ id: zId });

/** Token management is session-only (a PAT must not mint or revoke PATs). */
export function registerApiTokenRoutes(app: App, db: Db): void {
  const auth = { preHandler: [app.requireAuth, rejectPatAuth] };

  app.get(
    '/api/tokens',
    { ...auth, schema: { tags: ['tokens'], response: { 200: z.array(zApiToken) } } },
    async (req) => svc.listTokens(db, req.user.id),
  );

  app.post(
    '/api/tokens',
    {
      ...auth,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { tags: ['tokens'], body: zCreateApiToken, response: { 201: zApiTokenWithSecret } },
    },
    async (req, reply) => {
      const token = await svc.createToken(db, req.user.id, req.body);
      return reply.status(201).send(token);
    },
  );

  app.delete(
    '/api/tokens/:id',
    { ...auth, schema: { tags: ['tokens'], params: zTokenParams, response: { 204: z.null() } } },
    async (req, reply) => {
      await svc.revokeToken(db, req.user.id, req.params.id);
      return reply.status(204).send(null);
    },
  );
}
