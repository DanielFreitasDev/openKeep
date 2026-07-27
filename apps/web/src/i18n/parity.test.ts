import { describe, expect, it } from 'vitest';
import { resources } from './index.js';

function deepKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') {
      return deepKeys(v as Record<string, unknown>, key);
    }
    return [key];
  });
}

describe('i18n locale parity', () => {
  it('en and pt-BR expose identical namespaces and keys', () => {
    const en = deepKeys(resources.en as unknown as Record<string, unknown>).sort();
    const pt = deepKeys(resources['pt-BR'] as unknown as Record<string, unknown>).sort();
    expect(pt).toEqual(en);
  });

  it('no locale value is empty', () => {
    for (const locale of Object.values(resources)) {
      for (const ns of Object.values(locale)) {
        for (const [key, value] of Object.entries(ns as Record<string, string>)) {
          expect(value, `empty translation for ${key}`).not.toBe('');
        }
      }
    }
  });
});
