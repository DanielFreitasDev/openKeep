import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  APP_URL: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const cfg = loadConfig({ ...valid });
    expect(cfg.PORT).toBe(3000);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.isDev).toBe(true);
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('rejects a missing DATABASE_URL with a readable message', () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects secrets shorter than 32 chars', () => {
    expect(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('rejects a non-URL APP_URL', () => {
    expect(() => loadConfig({ ...valid, APP_URL: 'not a url' })).toThrow(/APP_URL/);
  });

  it('requires OAuth id+secret pairs to be set together', () => {
    expect(() => loadConfig({ ...valid, GOOGLE_CLIENT_ID: 'id-only' })).toThrow(/together/);
  });
});
