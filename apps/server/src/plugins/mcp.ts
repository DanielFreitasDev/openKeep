import { Readable } from 'node:stream';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { OpenKeepClient } from '@openkeep/mcp';
import { createOpenKeepMcpServer, FetchClient } from '@openkeep/mcp';
import type { App } from '../app.js';
import type { Auth } from '../auth/auth.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { verifyApiToken } from '../modules/api-tokens/service.js';
import { verifyOAuthToken } from '../modules/oauth/service.js';
import { toWebHeaders } from './auth.js';

/** Base64 of a 10 MB image plus JSON-RPC envelope headroom. */
const MCP_BODY_LIMIT = 15 * 1024 * 1024;

/**
 * OpenKeepClient over `app.inject`: the MCP layer calls our own REST routes
 * in-process, so Zod validation, sanitize, authz-404, versioning and the
 * realtime fan-out apply to AI traffic identically to browser traffic.
 * Reuses FetchClient wholesale — only the transport is swapped. Injected
 * requests carry no Origin header, so the global cross-site guard treats
 * them like any non-browser client.
 */
function injectClientFor(app: App, secret: string, clientId: string): OpenKeepClient {
  const injectFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());

    let payload: Buffer | string | undefined;
    if (init?.body instanceof FormData) {
      // Serialize multipart the standard way; inject needs a concrete body.
      const serialized = new Response(init.body);
      payload = Buffer.from(await serialized.arrayBuffer());
      const contentType = serialized.headers.get('content-type');
      if (contentType) headers['content-type'] = contentType;
    } else if (typeof init?.body === 'string') {
      payload = init.body;
    }

    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url: url.pathname + url.search,
      headers,
      ...(payload !== undefined ? { payload } : {}),
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(res.headers)) {
      if (value === undefined) continue;
      responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
    const body = res.statusCode === 204 || res.statusCode === 304 ? null : res.rawPayload;
    return new Response(body, { status: res.statusCode, headers: responseHeaders });
  };

  return new FetchClient({
    baseUrl: 'http://openkeep.inject',
    token: secret,
    clientId,
    fetchImpl: injectFetch,
  });
}

/**
 * Mounts the Streamable HTTP MCP endpoint at /api/mcp.
 *
 * Two credentials reach it: an `okp_` PAT (Claude Code, Claude Desktop, the
 * request-header connector) and an OAuth 2.1 access token (claude.ai and
 * ChatGPT, which cannot present a fixed secret). Both are re-verified on EVERY
 * request, so revocation applies immediately; the SDK handler is
 * auth-pass-through by design. Whichever one arrives is forwarded verbatim to
 * the injected REST calls, where `requireAuth` recognizes both.
 *
 * The route is hidden from the OpenAPI spec and rate limited independently of
 * the JSON API.
 */
export function registerMcp(app: App, config: Config, auth: Auth, db: Db): void {
  const handler = createMcpHandler((ctx) => {
    const auth = ctx.authInfo;
    // The route below always sets authInfo; a missing one is a programming error.
    if (!auth) throw new Error('MCP factory invoked without authInfo');
    return createOpenKeepMcpServer(injectClientFor(app, auth.token, auth.clientId), {
      capabilities: { localFs: false },
    });
  });

  app.addHook('onClose', async () => {
    await handler.close();
  });

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/api/mcp',
    bodyLimit: MCP_BODY_LIMIT,
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: { hide: true },
    handler: async (req, reply) => {
      const header = req.headers.authorization;
      const secret =
        typeof header === 'string' && header.startsWith('Bearer ')
          ? header.slice('Bearer '.length)
          : null;

      // Stable realtime origin — browser tabs drop echoes of "their" client id.
      // Keyed by the PAT for a token, by the connector for an OAuth grant.
      let authInfo: AuthInfo | null = null;
      if (secret?.startsWith('okp_')) {
        const verified = await verifyApiToken(db, secret);
        if (verified) {
          authInfo = { token: secret, clientId: `mcp:${verified.tokenId}`, scopes: [] };
        }
      } else if (secret) {
        const granted = await verifyOAuthToken(db, auth, toWebHeaders(req));
        if (granted) {
          authInfo = {
            token: secret,
            clientId: `mcp:oauth:${granted.clientId}`,
            scopes: granted.scopes,
          };
        }
      }

      if (!authInfo) {
        // RFC 9728: point an unauthenticated client at the protected-resource
        // document so it can find the authorization server on its own. This is
        // the handshake that makes claude.ai and ChatGPT connectors work.
        const resourceMetadata = `${config.APP_URL}/.well-known/oauth-protected-resource/api/mcp`;
        return reply
          .status(401)
          .header(
            'www-authenticate',
            `Bearer realm="OpenKeep MCP", error="invalid_token", resource_metadata="${resourceMetadata}"`,
          )
          .header('access-control-expose-headers', 'WWW-Authenticate')
          .header('content-type', 'application/problem+json; charset=utf-8')
          .send({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            code: 'unauthorized',
            detail:
              'Provide a valid API token (Authorization: Bearer okp_… — Settings → API tokens) or complete the OAuth flow advertised in WWW-Authenticate',
          });
      }

      const hasBody = req.body !== undefined && req.body !== null;
      const webResponse = await handler.fetch(
        new Request(new URL(req.raw.url ?? '/api/mcp', 'http://openkeep.internal'), {
          method: req.method,
          headers: toWebHeaders(req),
          ...(hasBody ? { body: JSON.stringify(req.body) } : {}),
        }),
        { authInfo, ...(hasBody ? { parsedBody: req.body } : {}) },
      );

      reply.status(webResponse.status);
      webResponse.headers.forEach((value, key) => {
        if (key === 'content-length' || key === 'transfer-encoding') return;
        reply.header(key, value);
      });
      if (!webResponse.body) return reply.send(null);
      return reply.send(Readable.fromWeb(webResponse.body));
    },
  });
}
