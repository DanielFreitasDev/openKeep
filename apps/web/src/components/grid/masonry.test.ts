import { describe, expect, it } from 'vitest';
import { columnsForWidth, gridWidth, layoutMasonry } from './masonry.js';

const item = (id: string, height: number) => ({ id, height });

describe('layoutMasonry', () => {
  it('flows items in order into the shortest column (leftmost tie-break)', () => {
    const { rects } = layoutMasonry([item('a', 100), item('b', 50), item('c', 10)], 2, 240, 16);
    expect(rects.get('a')).toEqual({ x: 0, y: 0 });
    expect(rects.get('b')).toEqual({ x: 256, y: 0 });
    // b's column (50) is shorter than a's (100) → c goes under b.
    expect(rects.get('c')).toEqual({ x: 256, y: 66 });
  });

  it('computes container height as the tallest column minus trailing gutter', () => {
    const { containerHeight } = layoutMasonry([item('a', 100), item('b', 30)], 2, 240, 16);
    expect(containerHeight).toBe(100);
  });

  it('handles a single column (list view)', () => {
    const { rects, containerHeight } = layoutMasonry([item('a', 40), item('b', 60)], 1, 600, 16);
    expect(rects.get('a')).toEqual({ x: 0, y: 0 });
    expect(rects.get('b')).toEqual({ x: 0, y: 56 });
    expect(containerHeight).toBe(116);
  });

  it('is stable for empty input', () => {
    const { rects, containerHeight } = layoutMasonry([], 3);
    expect(rects.size).toBe(0);
    expect(containerHeight).toBe(0);
  });

  it('never assigns overlapping rects in a column', () => {
    const items = Array.from({ length: 50 }, (_, i) => item(`n${i}`, 20 + ((i * 37) % 180)));
    const { rects } = layoutMasonry(items, 4, 240, 16);
    const byCol = new Map<number, { y: number; h: number }[]>();
    items.forEach((it) => {
      const r = rects.get(it.id);
      if (!r) throw new Error('missing rect');
      const col = r.x / 256;
      const list = byCol.get(col) ?? [];
      list.push({ y: r.y, h: it.height });
      byCol.set(col, list);
    });
    for (const list of byCol.values()) {
      list.sort((a, b) => a.y - b.y);
      for (let i = 1; i < list.length; i++) {
        expect(list[i]!.y).toBeGreaterThanOrEqual(list[i - 1]!.y + list[i - 1]!.h);
      }
    }
  });
});

describe('columnsForWidth', () => {
  it('matches Keep: floor((w+16)/(240+16)), min 1', () => {
    expect(columnsForWidth(240)).toBe(1);
    expect(columnsForWidth(495)).toBe(1);
    expect(columnsForWidth(496)).toBe(2);
    expect(columnsForWidth(1024)).toBe(4);
    expect(columnsForWidth(100)).toBe(1);
  });
});

describe('gridWidth', () => {
  it('accounts for inner gutters only', () => {
    expect(gridWidth(1)).toBe(240);
    expect(gridWidth(3)).toBe(240 * 3 + 32);
  });
});
