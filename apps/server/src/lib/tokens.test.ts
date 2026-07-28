import { describe, expect, it } from 'vitest';
import { generateToken, hashToken } from './tokens.js';

describe('generateToken', () => {
  it('produces okp_-prefixed base64url secrets with 256 bits of entropy', () => {
    const { secret, hash, prefix } = generateToken();
    expect(secret).toMatch(/^okp_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashToken(secret));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefix).toBe(secret.slice(0, 12));
  });

  it('never repeats secrets', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateToken().secret);
    expect(seen.size).toBe(100);
  });
});
