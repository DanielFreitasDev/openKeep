import { zOauthClient, zOauthClientId, zOauthConnection } from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { rejectPatAuth } from '../../plugins/auth.js';
import * as svc from './service.js';

const zClientParams = z.object({ clientId: zOauthClientId });

/**
 * Read-and-revoke surface for OAuth connectors. Session-only for the same
 * reason token management is (#19): a credential must not be able to inspect
 * or dissolve the grants that produced it.
 */
export function registerOAuthRoutes(app: App, db: Db): void {
  const auth = { preHandler: [app.requireAuth, rejectPatAuth] };

  app.get(
    '/api/oauth/clients/:clientId',
    {
      ...auth,
      schema: { tags: ['oauth'], params: zClientParams, response: { 200: zOauthClient } },
    },
    async (req) => svc.getClient(db, req.params.clientId),
  );

  app.get(
    '/api/oauth/connections',
    { ...auth, schema: { tags: ['oauth'], response: { 200: z.array(zOauthConnection) } } },
    async (req) => svc.listConnections(db, req.user.id),
  );

  app.delete(
    '/api/oauth/connections/:clientId',
    {
      ...auth,
      schema: { tags: ['oauth'], params: zClientParams, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await svc.revokeConnection(db, req.user.id, req.params.clientId);
      return reply.status(204).send(null);
    },
  );
}
