import {
  zAdminInstancePatch,
  zAdminMe,
  zAdminOverview,
  zAdminUserPage,
  zAdminUsersQuery,
  zDeleteUser,
  zDeleteUserResult,
} from '@openkeep/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import { rejectPatAuth } from '../../plugins/auth.js';
import * as svc from './service.js';

/**
 * Instance administration. Session-only like token management — a PAT must not
 * be able to close sign-ups or delete accounts, and that also keeps the whole
 * surface out of reach of the MCP server, which talks to these same routes.
 */
export function registerAdminRoutes(app: App, db: Db, config: Config, storage: Storage): void {
  const requireAdmin = async (req: FastifyRequest) => {
    if (!svc.isAdmin(config, req.user.email)) throw errors.forbidden('Not an instance admin');
  };
  const auth = { preHandler: [app.requireAuth, rejectPatAuth] };
  const adminOnly = { preHandler: [app.requireAuth, rejectPatAuth, requireAdmin] };

  app.get(
    '/api/admin/me',
    { ...auth, schema: { tags: ['admin'], response: { 200: zAdminMe } } },
    async (req) => ({ admin: svc.isAdmin(config, req.user.email) }),
  );

  app.get(
    '/api/admin/overview',
    { ...adminOnly, schema: { tags: ['admin'], response: { 200: zAdminOverview } } },
    async () => svc.getOverview(db, config),
  );

  app.patch(
    '/api/admin/instance',
    {
      ...adminOnly,
      schema: {
        tags: ['admin'],
        body: zAdminInstancePatch,
        response: { 200: zAdminOverview },
      },
    },
    async (req) => {
      await svc.setInstanceSettings(db, req.body);
      return svc.getOverview(db, config);
    },
  );

  app.get(
    '/api/admin/users',
    {
      ...adminOnly,
      schema: {
        tags: ['admin'],
        querystring: zAdminUsersQuery,
        response: { 200: zAdminUserPage },
      },
    },
    async (req) => svc.listUsers(db, config, { q: req.query.q, limit: req.query.limit }),
  );

  app.post(
    '/api/admin/users/:id/delete',
    {
      ...adminOnly,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['admin'],
        params: z.object({ id: z.string().min(1) }),
        body: zDeleteUser,
        response: { 200: zDeleteUserResult },
      },
    },
    async (req) => svc.deleteUser(db, config, req.params.id, storage),
  );
}
