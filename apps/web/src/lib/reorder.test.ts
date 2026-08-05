import { describe, expect, it } from 'vitest';
import { dropSlot, moveToSlot } from './reorder.js';

const rows = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];

describe('dropSlot', () => {
  it('reads the top half of a row as "insert before it"', () => {
    expect(dropSlot(rows, 'd', 'b', true)).toBe(1);
    expect(dropSlot(rows, 'd', 'a', true)).toBe(0);
  });

  it('reads the bottom half as "insert after it"', () => {
    expect(dropSlot(rows, 'd', 'b', false)).toBe(2);
    expect(dropSlot(rows, 'a', 'd', false)).toBe(3);
  });

  // The pointer names a row in the list as it reads now — dragged row included
  // — while the slot is an index into the list once that row is lifted out.
  it('discounts the dragged row for every slot below it', () => {
    expect(dropSlot(rows, 'a', 'b', false)).toBe(1);
    expect(dropSlot(rows, 'a', 'c', true)).toBe(1);
    expect(dropSlot(rows, 'a', 'c', false)).toBe(2);
  });

  it('names no slot for the dragged row itself, or for a row it does not know', () => {
    expect(dropSlot(rows, 'a', 'a', true)).toBeNull();
    expect(dropSlot(rows, 'a', 'zz', true)).toBeNull();
    expect(dropSlot(rows, 'zz', 'a', true)).toBeNull();
  });

  it('round-trips: the slot a neighbouring drop names is the neighbouring order', () => {
    expect(
      moveToSlot(rows, 'a', dropSlot(rows, 'a', 'b', false) as number).map((r) => r.key),
    ).toEqual(['b', 'a', 'c', 'd']);
    expect(
      moveToSlot(rows, 'd', dropSlot(rows, 'd', 'c', true) as number).map((r) => r.key),
    ).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('moveToSlot', () => {
  it('lifts the row out and puts it back at the slot', () => {
    expect(moveToSlot(rows, 'a', 2).map((r) => r.key)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveToSlot(rows, 'c', 0).map((r) => r.key)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('leaves the order alone when the row lands where it already is', () => {
    expect(moveToSlot(rows, 'b', 1).map((r) => r.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps out-of-range slots to the ends', () => {
    expect(moveToSlot(rows, 'a', 99).map((r) => r.key)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveToSlot(rows, 'd', -3).map((r) => r.key)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('is a copy, and a no-op for a row it does not hold', () => {
    const same = moveToSlot(rows, 'zz', 0);
    expect(same).not.toBe(rows);
    expect(same.map((r) => r.key)).toEqual(['a', 'b', 'c', 'd']);
  });
});
