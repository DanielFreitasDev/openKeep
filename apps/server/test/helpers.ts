import type { Config } from '../src/config.js';
import { loadConfig } from '../src/config.js';

export function testConfig(overrides: Partial<NodeJS.ProcessEnv> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://openkeep:openkeep@localhost:55432/openkeep_test',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-!!',
    APP_URL: 'http://localhost:5173',
    ...overrides,
  });
}
