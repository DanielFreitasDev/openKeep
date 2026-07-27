import { describe, expect, it } from 'vitest';
import {
  comparePositions,
  positionAfter,
  positionBefore,
  positionBetween,
  positionsBetween,
} from './fractional.js';

describe('fractional positions', () => {
  it('orders append/prepend/between correctly under bytewise comparison', () => {
    const first = positionBefore(null);
    const second = positionAfter(first);
    const between = positionBetween(first, second);
    expect(first < between && between < second).toBe(true);

    const before = positionBefore(first);
    expect(before < first).toBe(true);
  });

  it('generates N distinct ordered keys', () => {
    const keys = positionsBetween(null, null, 20);
    const sorted = [...keys].sort();
    expect(sorted).toEqual(keys);
    expect(new Set(keys).size).toBe(20);
  });

  it('survives repeated midpoint insertion (worst-case narrowing)', () => {
    let a = positionBefore(null);
    let b = positionAfter(a);
    for (let i = 0; i < 100; i++) {
      const mid = positionBetween(a, b);
      expect(a < mid && mid < b).toBe(true);
      if (i % 2 === 0) a = mid;
      else b = mid;
    }
  });

  it('breaks position ties by id', () => {
    const x = { position: 'a0', id: '018f0000-0000-7000-8000-000000000001' };
    const y = { position: 'a0', id: '018f0000-0000-7000-8000-000000000002' };
    expect(comparePositions(x, y)).toBeLessThan(0);
    expect(comparePositions(y, x)).toBeGreaterThan(0);
    expect(comparePositions(x, x)).toBe(0);
  });
});
