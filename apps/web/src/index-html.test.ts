import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(path.resolve(import.meta.dirname, '../index.html'), 'utf8');

describe('index.html', () => {
  // Production serves the SPA under `script-src 'self'` (apps/server/src/plugins/static.ts),
  // which silently drops inline scripts — the theme bootstrap lives in /theme-init.js.
  it('has no inline scripts (blocked by the production CSP)', () => {
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)];
    expect(inline).toEqual([]);
  });

  it('bootstraps the theme before the app loads', () => {
    expect(html).toContain('<script src="/theme-init.js"></script>');
  });
});
