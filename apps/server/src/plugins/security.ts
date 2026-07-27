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
