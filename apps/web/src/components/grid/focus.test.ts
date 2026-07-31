import { describe, expect, it } from 'vitest';
import type { FocusRect } from './focus.js';
import { nextInDirection } from './focus.js';

/**
 * Three columns of 240px cards with a 16px gutter, staggered the way masonry
 * staggers them: no two columns share a row.
 *
 *   x=0        x=256      x=512
 *   a (y0 h80) b (y0 h200) c (y0 h120)
 *   d (y96 h60)            e (y136 h90)
 */
const GRID: FocusRect[] = [
  { id: 'a', x: 0, y: 0, w: 240, h: 80 },
  { id: 'b', x: 256, y: 0, w: 240, h: 200 },
  { id: 'c', x: 512, y: 0, w: 240, h: 120 },
  { id: 'd', x: 0, y: 96, w: 240, h: 60 },
  { id: 'e', x: 512, y: 136, w: 240, h: 90 },
];

describe('nextInDirection', () => {
  it('moves down its own column, not to whatever is nearest', () => {
    expect(nextInDirection(GRID, 'a', 'down')).toBe('d');
    expect(nextInDirection(GRID, 'c', 'down')).toBe('e');
  });

  it('moves up its own column', () => {
    expect(nextInDirection(GRID, 'd', 'up')).toBe('a');
    expect(nextInDirection(GRID, 'e', 'up')).toBe('c');
  });

  it('steps one column sideways, staying in the nearest band', () => {
    expect(nextInDirection(GRID, 'a', 'right')).toBe('b');
    expect(nextInDirection(GRID, 'b', 'right')).toBe('c');
    expect(nextInDirection(GRID, 'c', 'left')).toBe('b');
    expect(nextInDirection(GRID, 'b', 'left')).toBe('a');
  });

  it('returns null at the edges', () => {
    expect(nextInDirection(GRID, 'a', 'up')).toBeNull();
    expect(nextInDirection(GRID, 'a', 'left')).toBeNull();
    expect(nextInDirection(GRID, 'c', 'right')).toBeNull();
    expect(nextInDirection(GRID, 'd', 'down')).toBeNull();
  });

  it('never leaves the column vertically, even when it ends early', () => {
    // b is the last card in its column: Down stops instead of leaping to a
    // neighbouring column the eye was not following.
    expect(nextInDirection(GRID, 'b', 'down')).toBeNull();
  });

  it('crosses sideways to a column no card is level with', () => {
    const staggered: FocusRect[] = [
      { id: 'left', x: 0, y: 0, w: 240, h: 50 },
      { id: 'right', x: 256, y: 400, w: 240, h: 50 },
    ];
    expect(nextInDirection(staggered, 'left', 'right')).toBe('right');
    expect(nextInDirection(staggered, 'right', 'left')).toBe('left');
  });

  it('takes the sideways neighbour level with the cursor, not the topmost', () => {
    // From d (y96) rightwards: b spans y0–200 and overlaps, so it wins over c.
    expect(nextInDirection(GRID, 'd', 'right')).toBe('b');
    // From e leftwards, b and d both overlap the band — the adjacent column
    // wins, so the cursor never skips a column sideways.
    expect(nextInDirection(GRID, 'e', 'left')).toBe('b');
  });

  it('handles a single column (list mode) as a plain list', () => {
    const list: FocusRect[] = [
      { id: 'a', x: 0, y: 0, w: 600, h: 100 },
      { id: 'b', x: 0, y: 116, w: 600, h: 100 },
      { id: 'c', x: 0, y: 232, w: 600, h: 100 },
    ];
    expect(nextInDirection(list, 'a', 'down')).toBe('b');
    expect(nextInDirection(list, 'b', 'down')).toBe('c');
    expect(nextInDirection(list, 'c', 'up')).toBe('b');
    expect(nextInDirection(list, 'b', 'right')).toBeNull();
  });

  it('ignores an id that is not rendered', () => {
    expect(nextInDirection(GRID, 'gone', 'down')).toBeNull();
  });
});
