import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { buildLogger } from './lib/logger.js';
import { registerErrorHandler } from './plugins/error-handler.js';

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function buildApp(config: Config) {
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

  await app.register(rateLimit, { global: false });

  app.get('/api/healthz', async () => ({ status: 'ok' }));
  app.get('/api/readyz', async () => ({ status: 'ok' }));

  return app;
}
