import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth, SessionUser } from '../auth/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { errors } from '../lib/errors.js';
import { verifyApiToken } from '../modules/api-tokens/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser;
    sessionId: string;
    /** Set when the request authenticated with a PAT (Bearer okp_…). */
    tokenId?: string;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    realtime: import('../realtime/registry.js').Realtime;
    /** Undefined unless METRICS_ENABLED — the jobs runner shares this one. */
    metrics: import('../lib/metrics.js').Metrics | undefined;
  }
}

/** preHandler for session-only surfaces (e.g. token management). */
export async function rejectPatAuth(req: FastifyRequest): Promise<void> {
  if (req.tokenId !== undefined) {
    throw errors.forbidden('API tokens cannot access this endpoint — sign in with a browser');
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
  db: Db,
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
    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer okp_')) {
      const verified = await verifyApiToken(db, header.slice('Bearer '.length));
      if (!verified) throw errors.unauthorized('Invalid or expired API token');
      req.user = verified.user;
      req.tokenId = verified.tokenId;
      req.sessionId = `pat:${verified.tokenId}`;
      return;
    }
    const session = await auth.api.getSession({ headers: toWebHeaders(req) });
    if (!session) throw errors.unauthorized();
    req.user = session.user as SessionUser;
    req.sessionId = session.session.id;
  });
}
