import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

describe('app skeleton', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp(testConfig());
  });
  afterAll(async () => {
    await app.close();
  });

  it('serves /api/healthz', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json();
    expect(body.code).toBe('not_found');
    expect(body.title).toBe('Not Found');
    expect(body.status).toBe(404);
    expect(typeof body.requestId).toBe('string');
  });
});
