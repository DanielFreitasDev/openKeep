import { describe, expect, it } from 'vitest';
import { buildPrefixTsquery } from './tsquery.js';

describe('buildPrefixTsquery', () => {
  it('builds AND-joined prefix terms', () => {
    expect(buildPrefixTsquery('grocery list')).toBe('grocery:* & list:*');
  });

  it('strips tsquery operators (injection attempts)', () => {
    expect(buildPrefixTsquery('milk & bread | !cheese')).toBe('milk:* & bread:* & cheese:*');
    expect(buildPrefixTsquery("a:*&b'--")).toBe('a:* & b:*');
    expect(buildPrefixTsquery('(x) <-> y')).toBe('x:* & y:*');
  });

  it('returns null for empty/operator-only input', () => {
    expect(buildPrefixTsquery('')).toBeNull();
    expect(buildPrefixTsquery('  & | ! ')).toBeNull();
  });

  it('caps the number of terms', () => {
    const q = buildPrefixTsquery(Array.from({ length: 30 }, (_, i) => `t${i}`).join(' '));
    expect(q?.split('&')).toHaveLength(12);
  });

  it('keeps accented terms intact (config handles folding)', () => {
    expect(buildPrefixTsquery('ação café')).toBe('ação:* & café:*');
  });
});
