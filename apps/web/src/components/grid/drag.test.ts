import { describe, expect, it } from 'vitest';
import type { DragSnapshot, DropTarget } from './drag.js';
import { dragTargetAt, insertIndexFor, previewLayout, sameDropTarget } from './drag.js';

/**
 * Two columns of 100px cards, 16px gutter:
 *   col 0: a(0) b(116) c(232)
 *   col 1: d(0) e(116)
 * `a` is the dragged card, so its column reads as b(0) c(116) while the drag
 * lasts — a 116px shift (100 + gutter).
 */
const snap = (dragId = 'a'): DragSnapshot => ({
  dragId,
  dragHeight: 100,
  cols: 2,
  cardW: 240,
  gutter: 16,
  items: [
    { id: 'a', x: 0, y: 0, height: 100 },
    { id: 'd', x: 256, y: 0, height: 100 },
    { id: 'b', x: 0, y: 116, height: 100 },
    { id: 'e', x: 256, y: 116, height: 100 },
    { id: 'c', x: 0, y: 232, height: 100 },
  ],
  containerHeight: 332,
});

/** The same board, but the dragged card belongs to the other section. */
const foreign = (): DragSnapshot => snap('x');

describe('dragTargetAt', () => {
  it('picks the column the pointer is over, clamped to the grid', () => {
    expect(dragTargetAt(snap(), 10, 10).col).toBe(0);
    expect(dragTargetAt(snap(), 300, 10).col).toBe(1);
    expect(dragTargetAt(snap(), -80, 10).col).toBe(0);
    expect(dragTargetAt(snap(), 9999, 10).col).toBe(1);
  });

  it('opens the gap above the card whose top half the pointer is in', () => {
    // b sits at a closed-up 0, so its midpoint is 50.
    expect(dragTargetAt(snap(), 10, 40)).toEqual({ col: 0, y: 0, beforeId: 'b', afterId: null });
    // past b's midpoint but above c's (closed up to 116, midpoint 166).
    expect(dragTargetAt(snap(), 10, 120)).toEqual({ col: 0, y: 116, beforeId: 'c', afterId: 'b' });
  });

  it('appends past the last card of the column', () => {
    expect(dragTargetAt(snap(), 10, 900)).toEqual({
      col: 0,
      y: 232,
      beforeId: null,
      afterId: 'c',
    });
  });

  it('measures the untouched column at its real position', () => {
    // d and e never move: d's midpoint stays at 50, e's at 166.
    expect(dragTargetAt(snap(), 300, 40)).toEqual({ col: 1, y: 0, beforeId: 'd', afterId: null });
    expect(dragTargetAt(snap(), 300, 120)).toEqual({ col: 1, y: 116, beforeId: 'e', afterId: 'd' });
  });

  it('targets an empty section', () => {
    const empty: DragSnapshot = { ...snap('x'), items: [], containerHeight: 0 };
    expect(dragTargetAt(empty, 10, 400)).toEqual({ col: 0, y: 0, beforeId: null, afterId: null });
  });

  it('leaves the column intact for a card dragged in from the other section', () => {
    expect(dragTargetAt(foreign(), 10, 40)).toEqual({ col: 0, y: 0, beforeId: 'a', afterId: null });
    expect(dragTargetAt(foreign(), 10, 120)).toEqual({
      col: 0,
      y: 116,
      beforeId: 'b',
      afterId: 'a',
    });
  });

  it('is a pure function of the pointer — no state to oscillate', () => {
    const s = snap();
    for (const py of [40, 120, 900, 120, 40]) {
      expect(dragTargetAt(s, 10, py)).toEqual(dragTargetAt(s, 10, py));
    }
    expect(dragTargetAt(s, 10, 40)).toEqual(dragTargetAt(s, 10, 41));
  });
});

describe('previewLayout', () => {
  it('holds the grid still while the pointer is outside the section', () => {
    const { rects, containerHeight } = previewLayout(snap(), null);
    expect(rects.get('a')).toEqual({ x: 0, y: 0 });
    expect(rects.get('b')).toEqual({ x: 0, y: 116 });
    expect(rects.get('c')).toEqual({ x: 0, y: 232 });
    expect(containerHeight).toBe(332);
  });

  it('closes the hole and opens the gap, touching nothing else', () => {
    const target: DropTarget = { col: 0, y: 116, beforeId: 'c', afterId: 'b' };
    const { rects } = previewLayout(snap(), target);
    expect(rects.get('b')).toEqual({ x: 0, y: 0 }); // closed up
    expect(rects.get('a')).toEqual({ x: 0, y: 116 }); // the gap
    expect(rects.get('c')).toEqual({ x: 0, y: 232 }); // back where it started
    // The other column is untouched — no column hopping mid-drag.
    expect(rects.get('d')).toEqual({ x: 256, y: 0 });
    expect(rects.get('e')).toEqual({ x: 256, y: 116 });
  });

  it('moves one card per slot the gap travels', () => {
    const first = previewLayout(snap(), dragTargetAt(snap(), 10, 40)).rects;
    const second = previewLayout(snap(), dragTargetAt(snap(), 10, 120)).rects;
    const moved = [...second.keys()].filter(
      (id) => first.get(id)?.x !== second.get(id)?.x || first.get(id)?.y !== second.get(id)?.y,
    );
    expect(moved.sort()).toEqual(['a', 'b']);
  });

  it('pushes the target column down when the card comes from the other section', () => {
    const s = foreign();
    const { rects } = previewLayout(s, dragTargetAt(s, 10, 40));
    expect(rects.get('a')).toEqual({ x: 0, y: 116 });
    expect(rects.get('b')).toEqual({ x: 0, y: 232 });
    expect(rects.get('c')).toEqual({ x: 0, y: 348 });
    expect(rects.get('d')).toEqual({ x: 256, y: 0 });
    // The section grows by the incoming card.
    expect(rects.get('x')).toEqual({ x: 0, y: 0 });
  });

  it('grows the container by the gap when the card lands at the bottom', () => {
    const s = foreign();
    const { containerHeight } = previewLayout(s, dragTargetAt(s, 10, 900));
    expect(containerHeight).toBe(348 + 100);
  });
});

describe('insertIndexFor', () => {
  const ids = ['b', 'c', 'd', 'e'];

  it('inserts before its anchor', () => {
    expect(insertIndexFor(ids, { col: 0, y: 0, beforeId: 'c', afterId: 'b' })).toBe(1);
  });

  it('inserts after the anchor when the gap is past a column', () => {
    expect(insertIndexFor(ids, { col: 0, y: 0, beforeId: null, afterId: 'c' })).toBe(2);
  });

  it('appends when the column is empty', () => {
    expect(insertIndexFor(ids, { col: 1, y: 0, beforeId: null, afterId: null })).toBe(4);
  });

  it('falls back to the trailing anchor when the leading one is gone', () => {
    expect(insertIndexFor(ids, { col: 0, y: 0, beforeId: 'gone', afterId: 'd' })).toBe(3);
  });

  it('gives up when both anchors left mid-drag', () => {
    expect(
      insertIndexFor(ids, { col: 0, y: 0, beforeId: 'gone', afterId: 'also-gone' }),
    ).toBeNull();
  });
});

describe('sameDropTarget', () => {
  it('compares by value so an unchanged pointer never re-renders the grid', () => {
    const a: DropTarget = { col: 0, y: 116, beforeId: 'c', afterId: 'b' };
    expect(sameDropTarget(a, { ...a })).toBe(true);
    expect(sameDropTarget(a, { ...a, y: 117 })).toBe(false);
    expect(sameDropTarget(null, null)).toBe(true);
    expect(sameDropTarget(a, null)).toBe(false);
  });
});
