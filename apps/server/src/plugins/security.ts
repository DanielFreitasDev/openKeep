import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { errors } from '../lib/errors.js';

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
    return payload;
  });
}
