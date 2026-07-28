import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('parses url + token and trims the trailing slash', () => {
    const config = loadConfig({
      OPENKEEP_URL: 'https://keep.example.com/',
      OPENKEEP_TOKEN: 'okp_abc',
    } as NodeJS.ProcessEnv);
    expect(config).toEqual({
      url: 'https://keep.example.com',
      token: 'okp_abc',
      clientId: undefined,
    });
  });

  it('treats empty strings as unset and aggregates every problem', () => {
    const err = (() => {
      try {
        loadConfig({ OPENKEEP_URL: '', OPENKEEP_TOKEN: '' } as NodeJS.ProcessEnv);
        return null;
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err?.message).toContain('OPENKEEP_URL');
    expect(err?.message).toContain('OPENKEEP_TOKEN');
  });

  it('rejects non-URL OPENKEEP_URL', () => {
    expect(() =>
      loadConfig({ OPENKEEP_URL: 'not a url', OPENKEEP_TOKEN: 'okp_x' } as NodeJS.ProcessEnv),
    ).toThrow('OPENKEEP_URL');
  });

  it('passes through an optional client id', () => {
    const config = loadConfig({
      OPENKEEP_URL: 'http://localhost:3000',
      OPENKEEP_TOKEN: 'okp_x',
      OPENKEEP_CLIENT_ID: 'my-agent',
    } as NodeJS.ProcessEnv);
    expect(config.clientId).toBe('my-agent');
  });
});
