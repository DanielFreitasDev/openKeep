import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth, SessionUser } from '../auth/auth.js';
import type { Config } from '../config.js';
import { errors } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser;
    sessionId: string;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    realtime: import('../realtime/registry.js').Realtime;
  }
}

export function toWebHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.append(key, value);
    }
  }
  return headers;
}

/**
 * Bridges Better Auth's fetch handler into Fastify at /api/auth/* and
 * decorates `requireAuth` + `req.user`.
 */
export async function registerAuth(
  app: FastifyInstance,
  config: Config,
  auth: Auth,
): Promise<void> {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const url = new URL(req.raw.url ?? '/', config.APP_URL);
    const method = req.method.toUpperCase();
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : req.body !== undefined && req.body !== null
          ? JSON.stringify(req.body)
          : undefined;

    const response = await auth.handler(
      new Request(url, { method, headers: toWebHeaders(req), ...(body ? { body } : {}) }),
    );

    reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key === 'set-cookie') return;
      reply.header(key, value);
    });
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length > 0) reply.header('set-cookie', setCookies);
    reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
  };

  app.route({ method: 'GET', url: '/api/auth/*', handler });
  app.route({
    method: 'POST',
    url: '/api/auth/*',
    // Credential endpoints: 10/min/IP.
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler,
  });

  app.decorate('requireAuth', async (req: FastifyRequest, _reply: FastifyReply) => {
    const session = await auth.api.getSession({ headers: toWebHeaders(req) });
    if (!session) throw errors.unauthorized();
    req.user = session.user as SessionUser;
    req.sessionId = session.session.id;
  });
}
