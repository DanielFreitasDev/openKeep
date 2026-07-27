import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTestApp } from './harness.js';

const SPEC_PATH = path.resolve(process.cwd(), '../../docs/openapi.json');

/**
 * Contract snapshot: the committed OpenAPI spec (generated from the shared
 * Zod schemas) must match the running app. Refresh with:
 *   UPDATE_OPENAPI=1 pnpm --filter @openkeep/server test -- openapi
 */
describe('openapi contract', () => {
  it('matches the committed docs/openapi.json', async () => {
    const t = await createTestApp();
    try {
      await t.app.ready();
      const spec = t.app.swagger();
      const rendered = `${JSON.stringify(spec, null, 2)}\n`;

      if (process.env.UPDATE_OPENAPI === '1' || !fs.existsSync(SPEC_PATH)) {
        fs.writeFileSync(SPEC_PATH, rendered);
      }
      const committed = fs.readFileSync(SPEC_PATH, 'utf8');
      expect(rendered).toBe(committed);
    } finally {
      await t.close();
    }
  });
});
