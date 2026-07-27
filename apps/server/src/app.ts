import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { zInstanceMeta } from '@openkeep/shared';
import fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Auth } from './auth/auth.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { buildLogger } from './lib/logger.js';
import { registerItemRoutes } from './modules/items/routes.js';
import { registerLabelRoutes } from './modules/labels/routes.js';
import { registerNotesRoutes } from './modules/notes/routes.js';
import { registerSearchRoutes } from './modules/search/routes.js';
import { registerSettingsRoutes } from './modules/settings/routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerOriginCheck } from './plugins/security.js';
import { registerSwagger } from './plugins/swagger.js';

export interface AppDeps {
  db: Db;
  pool: { query: (sql: string) => Promise<unknown> };
  auth: Auth;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp(config: Config, deps: AppDeps) {
  const app = fastify({
    loggerInstance: buildLogger(config),
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, {
    // The strict CSP is applied when the built SPA is served (production);
    // dev keeps Swagger UI and Vite happy.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  registerOriginCheck(app, config);
  await app.register(rateLimit, { global: false });
  await registerSwagger(app, config.isDev);
  await registerAuth(app, config, deps.auth);

  app.get(
    '/api/healthz',
    { schema: { tags: ['meta'], response: { 200: z.object({ status: z.string() }) } } },
    async () => ({ status: 'ok' }),
  );

  app.get(
    '/api/readyz',
    {
      schema: {
        tags: ['meta'],
        response: {
          200: z.object({ status: z.string() }),
          503: z.object({ status: z.string() }),
        },
      },
    },
    async (_req, reply) => {
      try {
        await deps.pool.query('SELECT 1');
        return { status: 'ok' };
      } catch {
        return reply.status(503).send({ status: 'unavailable' });
      }
    },
  );

  app.get(
    '/api/meta',
    { schema: { tags: ['meta'], response: { 200: zInstanceMeta } } },
    async () => ({
      oauth: {
        google: config.GOOGLE_CLIENT_ID !== undefined,
        github: config.GITHUB_CLIENT_ID !== undefined,
      },
      passwordReset: config.SMTP_URL !== undefined,
    }),
  );

  registerSettingsRoutes(app, deps.db);
  registerNotesRoutes(app, deps.db);
  registerItemRoutes(app, deps.db);
  registerLabelRoutes(app, deps.db);
  registerSearchRoutes(app, deps.db);

  return app;
}
