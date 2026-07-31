import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('metrics endpoint', () => {
  describe('disabled (the default)', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp();
    });
    afterAll(async () => {
      await t.close();
    });

    it('does not exist at all', async () => {
      const res = await t.app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('enabled without a token', () => {
    let t: TestApp;
    beforeAll(async () => {
      t = await createTestApp({ METRICS_ENABLED: 'true' });
    });
    afterAll(async () => {
      await t.close();
    });

    it('serves the Prometheus text format', async () => {
      // Something to count first.
      await t.app.inject({ method: 'GET', url: '/api/healthz' });

      const res = await t.app.inject({ method: 'GET', url: '/metrics' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.body).toContain('openkeep_http_requests_total');
      expect(res.body).toContain('route="/api/healthz"');
      // Default Node metrics keep their conventional names.
      expect(res.body).toContain('process_cpu_seconds_total');
      expect(res.body).toContain('nodejs_eventloop_lag_seconds');
    });

    it('exposes the live socket gauge and the job counters', async () => {
      const res = await t.app.inject({ method: 'GET', url: '/metrics' });
      expect(res.body).toContain('openkeep_ws_connections 0');
      expect(res.body).toContain('openkeep_job_runs_total');
    });

    // A scanner walking random URLs must not be able to mint a label per path.
    it('labels unmatched requests as one series', async () => {
      await t.app.inject({ method: 'GET', url: '/api/nope-1' });
      await t.app.inject({ method: 'GET', url: '/api/nope-2' });
      const res = await t.app.inject({ method: 'GET', url: '/metrics' });
      expect(res.body).toContain('route="unmatched"');
      expect(res.body).not.toContain('nope-1');
    });
  });

  describe('enabled with a token', () => {
    let t: TestApp;
    const token = 'metrics-token-0123456789';
    beforeAll(async () => {
      t = await createTestApp({ METRICS_ENABLED: 'true', METRICS_TOKEN: token });
    });
    afterAll(async () => {
      await t.close();
    });

    it('rejects a missing or wrong bearer token', async () => {
      const anonymous = await t.app.inject({ method: 'GET', url: '/metrics' });
      expect(anonymous.statusCode).toBe(401);

      const wrong = await t.app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: 'Bearer metrics-token-9876543210' },
      });
      expect(wrong.statusCode).toBe(401);
    });

    it('accepts the configured token', async () => {
      const res = await t.app.inject({
        method: 'GET',
        url: '/metrics',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('openkeep_http_requests_total');
    });
  });
});
