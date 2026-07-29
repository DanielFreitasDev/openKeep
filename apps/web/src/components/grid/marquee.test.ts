import { describe, expect, it } from 'vitest';
import {
  type BoxedNote,
  boxesIntersect,
  boxFromPoints,
  notesInBox,
  passedThreshold,
} from './marquee.js';

const card = (id: string, left: number, top: number): BoxedNote => ({
  id,
  box: { left, top, width: 240, height: 120 },
});

describe('boxFromPoints', () => {
  it('normalizes a drag in any direction', () => {
    const down = boxFromPoints({ x: 10, y: 20 }, { x: 110, y: 220 });
    expect(down).toEqual({ left: 10, top: 20, width: 100, height: 200 });
    // Dragging up-left spans the same box.
    expect(boxFromPoints({ x: 110, y: 220 }, { x: 10, y: 20 })).toEqual(down);
  });
});

describe('boxesIntersect', () => {
  const target = { left: 100, top: 100, width: 240, height: 120 };

  it('detects overlap, containment and edge contact', () => {
    expect(boxesIntersect({ left: 90, top: 90, width: 20, height: 20 }, target)).toBe(true);
    expect(boxesIntersect({ left: 0, top: 0, width: 1000, height: 1000 }, target)).toBe(true);
    expect(boxesIntersect({ left: 340, top: 100, width: 0, height: 0 }, target)).toBe(true);
  });

  it('rejects boxes that only come close', () => {
    expect(boxesIntersect({ left: 341, top: 100, width: 10, height: 10 }, target)).toBe(false);
    expect(boxesIntersect({ left: 100, top: 221, width: 10, height: 10 }, target)).toBe(false);
  });

  it('still sweeps cards on a perfectly vertical drag (zero-width box)', () => {
    expect(boxesIntersect({ left: 150, top: 0, width: 0, height: 400 }, target)).toBe(true);
  });
});

describe('notesInBox', () => {
  const cards = [card('a', 0, 0), card('b', 256, 0), card('c', 0, 136)];

  it('returns only the touched cards, in grid order', () => {
    const box = { left: 200, top: 0, width: 100, height: 50 };
    expect(notesInBox(box, cards)).toEqual(['a', 'b']);
  });

  it('returns nothing for a box over empty background', () => {
    expect(notesInBox({ left: 600, top: 600, width: 50, height: 50 }, cards)).toEqual([]);
  });
});

describe('passedThreshold', () => {
  it('ignores jitter and arms on either axis', () => {
    const origin = { x: 100, y: 100 };
    expect(passedThreshold(origin, { x: 104, y: 103 })).toBe(false);
    expect(passedThreshold(origin, { x: 106, y: 100 })).toBe(true);
    expect(passedThreshold(origin, { x: 100, y: 94 })).toBe(true);
  });
});
