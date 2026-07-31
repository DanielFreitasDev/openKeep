import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Prometheus instrumentation, built only when `METRICS_ENABLED=true`.
 *
 * The registry is per-instance rather than prom-client's global default: the
 * integration suite builds a fresh app per test, and re-registering a metric
 * name on a shared registry throws. Default Node metrics keep their standard
 * names (process_*, nodejs_*) so stock dashboards work unchanged; ours carry
 * the `openkeep_` prefix.
 */
export interface Metrics {
  registry: Registry;
  httpRequests: Counter<'method' | 'route' | 'status'>;
  httpDuration: Histogram<'method' | 'route'>;
  jobRuns: Counter<'queue' | 'outcome'>;
  jobDuration: Histogram<'queue'>;
  /** Reads the live socket count at scrape time (see `trackConnections`). */
  trackConnections: (count: () => number) => void;
}

export function createMetrics(): Metrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpRequests = new Counter({
    name: 'openkeep_http_requests_total',
    help: 'HTTP requests handled, by route template and status.',
    // The route TEMPLATE, never the raw path: `/api/notes/:id` is one series,
    // one per note id would be a cardinality bomb.
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });

  const httpDuration = new Histogram({
    name: 'openkeep_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const jobRuns = new Counter({
    name: 'openkeep_job_runs_total',
    help: 'pg-boss job executions, by queue and outcome.',
    labelNames: ['queue', 'outcome'] as const,
    registers: [registry],
  });

  const jobDuration = new Histogram({
    name: 'openkeep_job_duration_seconds',
    help: 'pg-boss job duration in seconds.',
    labelNames: ['queue'] as const,
    buckets: [0.05, 0.5, 1, 5, 15, 60, 300],
    registers: [registry],
  });

  const trackConnections = (count: () => number) => {
    new Gauge({
      name: 'openkeep_ws_connections',
      help: 'Open realtime WebSocket connections.',
      registers: [registry],
      // Sampled on scrape: a counter pair would drift the moment a socket dies
      // without a close frame.
      collect() {
        this.set(count());
      },
    });
  };

  return { registry, httpRequests, httpDuration, jobRuns, jobDuration, trackConnections };
}

/**
 * Times one job run and records its outcome. A no-op wrapper when metrics are
 * off, so the workers read the same either way — and a throw still propagates
 * to pg-boss, which owns retries.
 */
export async function trackJob<T>(
  metrics: Metrics | undefined,
  queue: string,
  run: () => Promise<T>,
): Promise<T> {
  if (!metrics) return run();
  const end = metrics.jobDuration.startTimer({ queue });
  try {
    const result = await run();
    metrics.jobRuns.inc({ queue, outcome: 'success' });
    return result;
  } catch (err) {
    metrics.jobRuns.inc({ queue, outcome: 'failure' });
    throw err;
  } finally {
    end();
  }
}
