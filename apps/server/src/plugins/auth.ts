import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Auth, SessionUser } from '../auth/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { errors } from '../lib/errors.js';
import { enterProtectionContext, isRevealed } from '../lib/note-protection.js';
import { verifyApiToken } from '../modules/api-tokens/service.js';
import { verifyOAuthToken } from '../modules/oauth/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser;
    sessionId: string;
    /** Set when the request authenticated with a PAT (Bearer okp_…). */
    tokenId?: string;
    /** Set when the request authenticated with an OAuth 2.1 access token. */
    oauthClientId?: string;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    realtime: import('../realtime/registry.js').Realtime;
    /** Undefined unless METRICS_ENABLED — the jobs runner shares this one. */
    metrics: import('../lib/metrics.js').Metrics | undefined;
  }
}

/**
 * preHandler for session-only surfaces (e.g. token management).
 *
 * Non-browser credentials are turned away as a class: an OAuth access token is
 * held by a third-party AI client, so it has even less business minting PATs or
 * reaching the admin panel than a PAT does.
 */
export async function rejectPatAuth(req: FastifyRequest): Promise<void> {
  if (req.tokenId !== undefined || req.oauthClientId !== undefined) {
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
 * decorates `requireAuth` + `req.user`. Also mounts the two OAuth discovery
 * documents at the origin root, where MCP clients look for them.
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
    const headers = toWebHeaders(req);

    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') {
        // Form-encoded token/registration requests pass through untouched.
        body = req.body;
      } else {
        body = JSON.stringify(req.body);
        headers.set('content-type', 'application/json');
      }
    }

    // Dynamic client registration is open by design — the discovery flow needs
    // it — which means any stranger can mint a client and craft an authorize
    // link. Without a consent step, a signed-in victim following that link
    // would hand over a code silently. Forcing `prompt=consent` makes the
    // grant an explicit, per-client act instead of a drive-by.
    if (url.pathname === '/api/auth/mcp/authorize') {
      const prompt = url.searchParams.get('prompt');
      if (prompt !== 'consent') {
        url.searchParams.set('prompt', prompt ? `${prompt} consent` : 'consent');
      }
    }

    const response = await auth.handler(
      new Request(url, { method, headers, ...(body !== undefined ? { body } : {}) }),
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

  await app.register(async (scope) => {
    // RFC 6749 token and registration requests are form-encoded; without a
    // parser Fastify would answer 415 before Better Auth ever sees them. Kept
    // as a raw string and forwarded verbatim, scoped to these routes only.
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, payload, done) => {
        done(null, payload);
      },
    );

    scope.route({ method: 'GET', url: '/api/auth/*', handler });
    scope.route({
      method: 'POST',
      url: '/api/auth/*',
      // Credential endpoints: 10/min/IP.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      handler,
    });

    /**
     * The OAuth machinery gets its own, looser budget. The 10/min above exists
     * to slow password guessing, and none of these take a password: connecting
     * one client already costs three POSTs (register, consent, token), every
     * connector refreshes hourly, and a shared egress IP multiplies both — so
     * the credential limit would turn into connectors that mysteriously stop
     * working. Still bounded, because registration is unauthenticated.
     */
    const oauthLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } }, handler };
    scope.route({ method: 'POST', url: '/api/auth/mcp/*', ...oauthLimit });
    scope.route({ method: 'POST', url: '/api/auth/oauth2/consent', ...oauthLimit });
  });

  /**
   * Discovery lives under the Better Auth base path, but clients probe the
   * origin root (RFC 8414) and the resource-suffixed form (RFC 9728). Both are
   * unauthenticated, cacheable JSON documents, so they are re-served here
   * rather than redirected — a redirect is one more thing for a client to get
   * wrong.
   */
  const discovery = async (req: FastifyRequest, reply: FastifyReply) => {
    const metadata = await auth.api.getMcpOAuthConfig({
      headers: toWebHeaders(req),
    });
    return reply.header('cache-control', 'public, max-age=3600').send(metadata);
  };
  const protectedResource = async (req: FastifyRequest, reply: FastifyReply) => {
    const metadata = await auth.api.getMCPProtectedResource({
      headers: toWebHeaders(req),
    });
    return reply.header('cache-control', 'public, max-age=3600').send(metadata);
  };

  for (const url of [
    '/.well-known/oauth-authorization-server',
    '/.well-known/openid-configuration',
  ])
    app.route({ method: 'GET', url, schema: { hide: true }, handler: discovery });
  for (const url of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/api/mcp',
  ])
    app.route({ method: 'GET', url, schema: { hide: true }, handler: protectedResource });

  app.decorate('requireAuth', async (req: FastifyRequest, _reply: FastifyReply) => {
    // Opened before the session is known so that an early throw still leaves a
    // context behind — an absent one and a `revealed: false` one mean the same
    // thing, but only one of them is an accident waiting to happen.
    const protection = enterProtectionContext();

    const header = req.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      const secret = header.slice('Bearer '.length);
      // Neither branch below carries a reveal: a token, unlike a browser,
      // cannot be asked to retype a password — so protected notes stay hidden
      // from the MCP server and every other agent holding a credential.
      if (secret.startsWith('okp_')) {
        const verified = await verifyApiToken(db, secret);
        if (!verified) throw errors.unauthorized('Invalid or expired API token');
        req.user = verified.user;
        req.tokenId = verified.tokenId;
        req.sessionId = `pat:${verified.tokenId}`;
        return;
      }
      const granted = await verifyOAuthToken(db, auth, toWebHeaders(req));
      if (!granted) throw errors.unauthorized('Invalid or expired access token');
      req.user = granted.user;
      req.oauthClientId = granted.clientId;
      req.sessionId = `oauth:${granted.clientId}`;
      return;
    }
    const session = await auth.api.getSession({ headers: toWebHeaders(req) });
    if (!session) throw errors.unauthorized();
    req.user = session.user as SessionUser;
    req.sessionId = session.session.id;
    protection.revealed = isRevealed(req.sessionId);
  });
}
