import { describe, expect, it } from 'vitest';
import { formatBytes } from './bytes.js';

describe('formatBytes', () => {
  it('keeps whole bytes whole and climbs one unit at a time', () => {
    expect(formatBytes(0, 'en')).toBe('0 byte');
    expect(formatBytes(999, 'en')).toBe('999 byte');
    expect(formatBytes(1024, 'en')).toBe('1 kB');
    expect(formatBytes(1024 * 1024 * 3.5, 'en')).toBe('3.5 MB');
  });

  it('speaks the reader locale', () => {
    expect(formatBytes(1024 * 1024 * 1.5, 'pt-BR')).toBe('1,5 MB');
  });

  it('never renders a negative size', () => {
    expect(formatBytes(-5, 'en')).toBe('0 byte');
  });
});
