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
import { createMetrics } from './lib/metrics.js';
import type { Storage } from './lib/storage.js';
import { registerAdminRoutes } from './modules/admin/routes.js';
import { getInstanceSettings } from './modules/admin/service.js';
import { registerApiTokenRoutes } from './modules/api-tokens/routes.js';
import { registerAttachmentRoutes } from './modules/attachments/routes.js';
import { registerCalendarRoutes } from './modules/calendar/routes.js';
import { registerImportExportRoutes } from './modules/import-export/routes.js';
import { registerItemRoutes } from './modules/items/routes.js';
import { registerLabelRoutes } from './modules/labels/routes.js';
import { registerLinkPreviewRoutes } from './modules/link-preview/routes.js';
import { registerNotesRoutes } from './modules/notes/routes.js';
import { registerReminderRoutes } from './modules/reminders/routes.js';
import { registerSearchRoutes } from './modules/search/routes.js';
import { registerSettingsRoutes } from './modules/settings/routes.js';
import { registerSharingRoutes } from './modules/sharing/routes.js';
import type { EnqueueWebhook } from './modules/webhooks/dispatcher.js';
import { WebhookDispatcher } from './modules/webhooks/dispatcher.js';
import { registerWebhookRoutes } from './modules/webhooks/routes.js';
import { registerAuth } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerMcp } from './plugins/mcp.js';
import { registerMetrics } from './plugins/metrics.js';
import { registerApiCsp, registerOriginCheck } from './plugins/security.js';
import { findWebDist, registerSpa, spaFallback } from './plugins/static.js';
import { registerSwagger } from './plugins/swagger.js';
import { Realtime } from './realtime/registry.js';
import { registerWs } from './realtime/ws.js';

export interface AppDeps {
  db: Db;
  pool: { query: (sql: string) => Promise<unknown> };
  auth: Auth;
  storage: Storage;
  /** Enqueue a link-preview fetch (pg-boss in prod; direct in tests). */
  enqueueLinkPreview?: (url: string, requestedBy: string) => Promise<void>;
  /** Enqueue an import/export job (pg-boss in prod; direct in tests). */
  enqueueJob?: (queue: 'import-takeout' | 'export-user-data', jobId: string) => Promise<void>;
  /** Enqueue one webhook delivery (pg-boss in prod; direct in tests). */
  enqueueWebhook?: EnqueueWebhook;
  /** In-process realtime registry (created here when absent). */
  realtime?: Realtime;
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
  // Resolved before the error handler because the single not-found handler
  // (one per prefix in Fastify) must know whether to fall back to the SPA.
  const spaDist = config.isProd ? findWebDist() : null;
  registerErrorHandler(app, spaDist ? { spaFallback } : {});

  await app.register(helmet, {
    // The strict CSP is applied when the built SPA is served (production);
    // dev keeps Swagger UI and Vite happy.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  registerOriginCheck(app, config);
  registerApiCsp(app);
  // Before the routes it measures: the onResponse hook must be in place when
  // the first request lands.
  const metrics = config.METRICS_ENABLED ? createMetrics() : undefined;
  await app.register(rateLimit, { global: false });
  const realtime = deps.realtime ?? new Realtime();
  app.decorate('realtime', realtime);
  app.decorate('metrics', metrics);
  if (metrics) registerMetrics(app, config, metrics, () => realtime.connectionCount());
  await registerWs(app, config, deps.auth, realtime);
  await registerSwagger(app, config.isDev);
  await registerAuth(app, config, deps.auth, deps.db);

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
      trashRetentionDays: config.TRASH_RETENTION_DAYS,
      // Read per request, not at boot: the admin panel flips this at runtime
      // and the login page is what has to stop offering the form.
      signupEnabled: (await getInstanceSettings(deps.db)).signupEnabled,
    }),
  );

  // Attached before any route can publish: the dispatcher is the second
  // reader of every realtime event.
  const webhooks = new WebhookDispatcher(deps.db, deps.enqueueWebhook ?? (async () => {}), app.log);
  await webhooks.refresh();
  realtime.onPublish = webhooks.publish;

  registerSettingsRoutes(app, deps.db, realtime, config);
  registerApiTokenRoutes(app, deps.db);
  registerWebhookRoutes(app, deps.db, config, webhooks);
  registerAdminRoutes(app, deps.db, config, deps.storage);
  registerNotesRoutes(app, deps.db, realtime, config, deps.storage);
  registerItemRoutes(app, deps.db, realtime);
  registerLabelRoutes(app, deps.db, realtime);
  registerSearchRoutes(app, deps.db);
  await registerAttachmentRoutes(app, deps.db, deps.storage, realtime, config);
  registerLinkPreviewRoutes(app, deps.db, deps.enqueueLinkPreview ?? (async () => {}));
  registerReminderRoutes(app, deps.db, config, realtime);
  registerCalendarRoutes(app, deps.db, config);
  registerSharingRoutes(app, deps.db, realtime, config, deps.storage);
  registerImportExportRoutes(app, deps.db, deps.storage, deps.enqueueJob ?? (async () => {}));
  registerMcp(app, deps.db);

  // Production: serve the built SPA same-origin with the strict CSP.
  if (spaDist) await registerSpa(app, spaDist);
  else if (config.isProd) app.log.warn('web dist not found — API-only mode');

  return app;
}
