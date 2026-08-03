import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { errors } from '../lib/errors.js';
import { requestIsRevealed } from '../lib/note-protection.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site mutation guard. Same-origin serving means CORS is never
 * registered; this hook rejects any state-changing request that a browser
 * marks as coming from another site (`Sec-Fetch-Site`), falling back to the
 * `Origin` header for older agents. Non-browser clients (no Origin) pass.
 */
export function registerOriginCheck(app: FastifyInstance, config: Config): void {
  const appOrigin = new URL(config.APP_URL).origin;

  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;

    const secFetchSite = req.headers['sec-fetch-site'];
    if (typeof secFetchSite === 'string') {
      if (secFetchSite === 'same-origin' || secFetchSite === 'none') return;
      throw errors.forbidden('Cross-site request rejected');
    }

    const origin = req.headers.origin;
    if (origin !== undefined && origin !== appOrigin) {
      throw errors.forbidden('Cross-origin request rejected');
    }
  });
}

/**
 * A JSON API response never legitimately loads anything, so it gets the
 * tightest policy there is. Belt-and-braces next to `nosniff`: if a browser
 * were ever tricked into treating a payload as a document, nothing in it can
 * fetch, script or be framed.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/** `application/json` and the error handler's `application/problem+json`. */
const JSON_TYPE = /^application\/(problem\+)?json/;

/** "This response was served behind an open curtain — do not write it down." */
export const REVEALED_HEADER = 'x-openkeep-revealed';

/**
 * CSP for API responses. Keyed off the serialized content type rather than the
 * route, so Swagger UI (dev-only HTML/JS under `/api/docs`), the SPA and
 * attachment downloads keep the headers they set for themselves.
 */
export function registerApiCsp(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply, payload) => {
    const type = reply.getHeader('content-type');
    if (typeof type === 'string' && JSON_TYPE.test(type)) {
      void reply.header('content-security-policy', API_CSP);
    }
    // A revealed request may be carrying a protected note's words or images,
    // and those must not outlive the reveal window in the browser's HTTP cache
    // or the service worker's offline copy. `no-store` handles the browser;
    // workbox ignores cache headers, so it is told by a header of ours (see
    // sw.ts). A marker rather than `no-store` itself, because other endpoints
    // set that for their own reasons — Better Auth's session route does, and a
    // worker that skipped everything wearing it would stop caching the session
    // the app boots offline from.
    if (requestIsRevealed()) {
      void reply.header('cache-control', 'no-store');
      void reply.header(REVEALED_HEADER, '1');
    }
    return payload;
  });
}
