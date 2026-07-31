import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { errors } from '../lib/errors.js';
import type { Metrics } from '../lib/metrics.js';

/** Constant-time compare that also tolerates different lengths. */
function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * `GET /metrics` in the Prometheus text format — absent entirely (404) unless
 * `METRICS_ENABLED=true`, so the default install exposes nothing.
 *
 * Auth is the deployment's call: with `METRICS_TOKEN` set the endpoint wants
 * `Authorization: Bearer <token>`, without it the endpoint is open and the
 * operator is expected to keep it off the public listener (see DEPLOYMENT.md).
 * It carries no note content — counts, timings and process stats only — but it
 * does describe the instance, so the token is the recommended setup.
 *
 * Deliberately outside `/api`: it is not part of the JSON API (no session, no
 * PAT, no OpenAPI entry), and scrapers expect it at the root.
 */
export function registerMetrics(
  app: FastifyInstance,
  config: Config,
  metrics: Metrics,
  connections: () => number,
): void {
  metrics.trackConnections(connections);

  app.addHook('onResponse', async (req, reply) => {
    // Unmatched requests share one series — a 404 scanner must not be able to
    // mint labels at will.
    const route = req.routeOptions.url ?? 'unmatched';
    const method = req.method;
    metrics.httpRequests.inc({ method, route, status: reply.statusCode });
    metrics.httpDuration.observe({ method, route }, reply.elapsedTime / 1000);
  });

  app.get('/metrics', { schema: { hide: true } }, async (req, reply) => {
    const token = config.METRICS_TOKEN;
    if (token !== undefined) {
      const header = req.headers.authorization ?? '';
      const offered = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!sameSecret(offered, token)) throw errors.unauthorized('Invalid metrics token');
    }
    return reply.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });
}
