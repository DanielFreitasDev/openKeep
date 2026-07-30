import { describe, expect, it } from 'vitest';
import type { DragCard } from './drag.js';
import {
  buildDragSnapshot,
  dragTargetAt,
  insertIndexFor,
  previewLayout,
  sameDropTarget,
  targetForIndex,
} from './drag.js';
import { layoutMasonry } from './masonry.js';

const CARD_W = 240;
const GUTTER = 16;
const STEP = CARD_W + GUTTER;
const DRAG_H = 100;

/** Deliberately uneven heights: this is where column packing gets interesting. */
const CARDS: DragCard[] = [
  { id: 'a', height: 200 },
  { id: 'b', height: 40 },
  { id: 'c', height: 120 },
  { id: 'd', height: 60 },
  { id: 'e', height: 300 },
  { id: 'f', height: 80 },
  { id: 'g', height: 140 },
];

/** The board as rendered: the dragged card sits at `homeIndex`. */
const board = (homeIndex: number, cards = CARDS, dragHeight = DRAG_H) => [
  ...cards.slice(0, homeIndex),
  { id: 'x', height: dragHeight },
  ...cards.slice(homeIndex),
];

const HOME = 3;

const build = (cards = CARDS, cols = 3, dragHeight = DRAG_H, homeIndex: number | null = HOME) =>
  buildDragSnapshot(
    cards,
    'x',
    dragHeight,
    cols,
    CARD_W,
    GUTTER,
    layoutMasonry(
      homeIndex === null ? cards : board(homeIndex, cards, dragHeight),
      cols,
      CARD_W,
      GUTTER,
    ),
  );

describe('buildDragSnapshot', () => {
  it('freezes the section exactly as rendered', () => {
    const snap = build();
    const rendered = layoutMasonry(board(HOME), 3, CARD_W, GUTTER);
    for (const card of [...CARDS, { id: 'x', height: DRAG_H }]) {
      expect(snap.rects.get(card.id)).toEqual(rendered.rects.get(card.id));
    }
    expect(snap.home).toEqual(rendered.rects.get('x'));
  });

  it('has no home slot for a card dragged in from the other section', () => {
    expect(build(CARDS, 3, DRAG_H, null).home).toBeNull();
  });

  it('offers one slot per card plus the appended one', () => {
    expect(build().slots).toHaveLength(CARDS.length + 1);
  });

  /**
   * The whole point: a slot is a promise about where the card ends up. If this
   * breaks, the preview shows one spot and the drop delivers another.
   */
  it('promises exactly where the flow will put the dropped card', () => {
    for (const cols of [1, 2, 3, 4]) {
      for (const dragHeight of [40, 100, 400]) {
        const snap = build(CARDS, cols, dragHeight);
        for (let k = 0; k <= CARDS.length; k++) {
          const reordered = [
            ...CARDS.slice(0, k),
            { id: 'x', height: dragHeight },
            ...CARDS.slice(k),
          ];
          const settled = layoutMasonry(reordered, cols, CARD_W, GUTTER);
          expect(settled.rects.get('x')).toEqual(snap.slots[k]);
        }
      }
    }
  });

  it('appends into the shortest column', () => {
    const snap = build();
    const bare = layoutMasonry(CARDS, 3, CARD_W, GUTTER);
    const shortest = Math.min(...bare.colHeights);
    expect(snap.slots.at(-1)).toEqual({
      x: bare.colHeights.indexOf(shortest) * STEP,
      y: shortest,
    });
  });
});

describe('targetForIndex', () => {
  it('maps an index to the card it lands in front of', () => {
    const snap = build();
    expect(targetForIndex(snap, 2)).toEqual({ beforeId: 'c', ...snap.slots[2] });
    expect(targetForIndex(snap, CARDS.length)).toEqual({
      beforeId: null,
      ...snap.slots[CARDS.length],
    });
  });

  it('parks a picked-up card in the slot it already occupies', () => {
    const snap = build();
    expect(targetForIndex(snap, HOME)).toMatchObject(snap.home ?? {});
  });

  it('clamps out-of-range indexes', () => {
    const snap = build();
    expect(targetForIndex(snap, -5)).toEqual(targetForIndex(snap, 0));
    expect(targetForIndex(snap, 99)).toEqual(targetForIndex(snap, CARDS.length));
  });
});

describe('dragTargetAt', () => {
  it('only ever returns a reachable slot', () => {
    const snap = build();
    const reachable = snap.slots.map((s) => `${s.x},${s.y}`);
    for (let px = -40; px < 3 * STEP + 40; px += 37) {
      for (let py = -40; py < 900; py += 23) {
        const t = dragTargetAt(snap, px, py);
        expect(reachable).toContain(`${t.x},${t.y}`);
      }
    }
  });

  it('stays in the column the pointer is over when that column has a slot', () => {
    const snap = build();
    for (const col of [0, 1, 2]) {
      const inColumn = snap.slots.filter((s) => s.x === col * STEP);
      if (inColumn.length === 0) continue;
      expect(dragTargetAt(snap, col * STEP + 10, 250).x).toBe(col * STEP);
    }
  });

  it('picks the slot nearest the pointer within that column', () => {
    const snap = build();
    const col0 = snap.slots.filter((s) => s.x === 0).sort((p, q) => p.y - q.y);
    const first = col0[0]!;
    const last = col0.at(-1)!;
    expect(dragTargetAt(snap, 10, first.y).y).toBe(first.y);
    expect(dragTargetAt(snap, 10, last.y + 500).y).toBe(last.y);
  });

  it('clamps the pointer to the grid', () => {
    const snap = build();
    expect(dragTargetAt(snap, -500, 100).x).toBe(0);
    expect(dragTargetAt(snap, 99999, 100).x).toBe(2 * STEP);
  });

  it('is a pure function of the pointer — a pointer at rest holds still', () => {
    const snap = build();
    for (const py of [0, 120, 400, 120, 0]) {
      expect(dragTargetAt(snap, 10, py)).toEqual(dragTargetAt(snap, 10, py));
    }
    expect(dragTargetAt(snap, 10, 200)).toEqual(dragTargetAt(snap, 10, 201));
  });

  it('handles a section with nothing left in it', () => {
    const snap = build([], 3);
    expect(dragTargetAt(snap, 600, 400)).toEqual({ beforeId: null, x: 0, y: 0 });
  });
});

describe('previewLayout', () => {
  /**
   * Two columns of a(200) x(100) b(40) c(120) — as rendered:
   *   col 0: a at 0
   *   col 1: x at 0, b at 116, c at 172
   * so x's reachable slots are (0,0), its own (256,0), (256,56) and (256,192).
   */
  const TINY = [
    { id: 'a', height: 200 },
    { id: 'b', height: 40 },
    { id: 'c', height: 120 },
  ];
  const tiny = (homeIndex: number | null = 1) => build(TINY, 2, DRAG_H, homeIndex);

  it('lays the fixture out as documented', () => {
    const snap = tiny();
    expect(snap.rects.get('a')).toEqual({ x: 0, y: 0 });
    expect(snap.home).toEqual({ x: STEP, y: 0 });
    expect(snap.rects.get('b')).toEqual({ x: STEP, y: 116 });
    expect(snap.slots).toEqual([
      { x: 0, y: 0 },
      { x: STEP, y: 0 },
      { x: STEP, y: 56 },
      { x: STEP, y: 192 },
    ]);
  });

  it('leaves the section alone while the pointer is over the other one', () => {
    const snap = tiny();
    const { rects, containerHeight } = previewLayout(snap, null);
    for (const id of ['a', 'b', 'c', 'x']) {
      expect(rects.get(id)).toEqual(snap.rects.get(id));
    }
    expect(containerHeight).toBe(snap.containerHeight);
  });

  /** A card just picked up has asked for nothing, so nothing may move. */
  it('is the identity for the card’s own slot', () => {
    const snap = tiny();
    const { rects } = previewLayout(snap, targetForIndex(snap, 1));
    for (const id of ['a', 'b', 'c', 'x']) {
      expect(rects.get(id)).toEqual(snap.rects.get(id));
    }
  });

  it('closes up behind the card and opens a gap ahead of it', () => {
    const { rects } = previewLayout(tiny(), targetForIndex(tiny(), 2));
    expect(rects.get('a')).toEqual({ x: 0, y: 0 }); // other column: untouched
    expect(rects.get('b')).toEqual({ x: STEP, y: 0 }); // closed up
    expect(rects.get('x')).toEqual({ x: STEP, y: 56 }); // the gap
    expect(rects.get('c')).toEqual({ x: STEP, y: 172 }); // still making room
  });

  it('moves the card across columns without re-packing either of them', () => {
    const { rects } = previewLayout(tiny(), targetForIndex(tiny(), 0));
    expect(rects.get('x')).toEqual({ x: 0, y: 0 });
    expect(rects.get('a')).toEqual({ x: 0, y: 116 }); // made room
    expect(rects.get('b')).toEqual({ x: STEP, y: 0 }); // closed up
    expect(rects.get('c')).toEqual({ x: STEP, y: 56 });
  });

  it('never moves a card more than one card height, or out of its column', () => {
    const snap = build();
    for (let k = 0; k <= CARDS.length; k++) {
      const { rects } = previewLayout(snap, targetForIndex(snap, k));
      for (const card of CARDS) {
        const from = snap.rects.get(card.id)!;
        const to = rects.get(card.id)!;
        expect(to.x).toBe(from.x);
        expect(Math.abs(to.y - from.y)).toBeLessThanOrEqual(DRAG_H + GUTTER);
      }
    }
  });

  it('only opens a gap for a card dragged in from the other section', () => {
    const snap = tiny(null); // nothing to close up: no card left this section
    const { rects } = previewLayout(snap, targetForIndex(snap, 0));
    expect(rects.get('x')).toEqual({ x: 0, y: 0 });
    expect(rects.get('a')).toEqual({ x: 0, y: DRAG_H + GUTTER });
    expect(rects.get('b')).toEqual(snap.rects.get('b'));
  });

  it('reaches down to whatever the preview leaves lowest', () => {
    const snap = tiny();
    expect(previewLayout(snap, targetForIndex(snap, 3)).containerHeight).toBe(192 + DRAG_H);
    expect(previewLayout(snap, targetForIndex(snap, 0)).containerHeight).toBe(116 + 200);
  });
});

describe('insertIndexFor', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('inserts before its anchor', () => {
    expect(insertIndexFor(ids, { beforeId: 'c', x: 0, y: 0 })).toBe(2);
  });

  it('appends when there is no anchor', () => {
    expect(insertIndexFor(ids, { beforeId: null, x: 0, y: 0 })).toBe(4);
  });

  it('gives up when the anchor left mid-drag', () => {
    expect(insertIndexFor(ids, { beforeId: 'gone', x: 0, y: 0 })).toBeNull();
  });
});

describe('sameDropTarget', () => {
  it('compares by value so an unchanged pointer never re-renders the grid', () => {
    const a = { beforeId: 'c', x: 0, y: 116 };
    expect(sameDropTarget(a, { ...a })).toBe(true);
    expect(sameDropTarget(a, { ...a, y: 117 })).toBe(false);
    expect(sameDropTarget(null, null)).toBe(true);
    expect(sameDropTarget(a, null)).toBe(false);
  });
});
