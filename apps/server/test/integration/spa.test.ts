import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPA_CSP } from '../../src/plugins/static.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

/**
 * Boots the app exactly like the production container does (isProd + a built
 * web dist) — this is the only path where the SPA plugin registers, so it is
 * invisible to every other test. Regression for the boot crash where both the
 * error handler and the SPA plugin tried to claim the root not-found handler.
 */
describe('production SPA serving', () => {
  let t: TestApp;
  let distDir: string;
  const prevWebDistDir = process.env.WEB_DIST_DIR;

  beforeAll(async () => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openkeep-web-dist-'));
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><title>OpenKeep</title>');
    fs.mkdirSync(path.join(distDir, 'assets'));
    fs.writeFileSync(path.join(distDir, 'assets', 'app-abc123.js'), 'console.log("ok");');

    process.env.WEB_DIST_DIR = distDir;
    t = await createTestApp({ NODE_ENV: 'production' });
  });

  afterAll(async () => {
    if (prevWebDistDir === undefined) delete process.env.WEB_DIST_DIR;
    else process.env.WEB_DIST_DIR = prevWebDistDir;
    await t.close();
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('serves index.html at / with the strict CSP and no-cache', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe(SPA_CSP);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('OpenKeep');
  });

  it('serves hashed assets as immutable', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('falls back to index.html for client routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/labels/some-uuid' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe(SPA_CSP);
    expect(res.body).toContain('OpenKeep');
  });

  it('keeps problem+json 404s for unknown API routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/definitely-not-a-route' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ code: 'not_found', status: 404 });
  });

  it('keeps problem+json 404s for non-GET requests outside /api', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/labels/some-uuid' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
