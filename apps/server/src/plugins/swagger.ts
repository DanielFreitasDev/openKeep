import swagger from '@fastify/swagger';
import { APP_VERSION } from '@openkeep/shared';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/** OpenAPI generated from the shared Zod schemas. Swagger UI in dev only. */
export async function registerSwagger(app: FastifyInstance, withUi: boolean): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'OpenKeep API',
        description: 'Open-source, self-hostable Google Keep alternative',
        version: APP_VERSION,
      },
      tags: [
        { name: 'auth', description: 'Better Auth endpoints (bridged)' },
        { name: 'settings', description: 'User settings' },
        { name: 'meta', description: 'Instance metadata & health' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  if (withUi) {
    const { default: swaggerUi } = await import('@fastify/swagger-ui');
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  }
}
