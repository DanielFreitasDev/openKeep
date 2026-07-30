/**
 * Pure geometry for the drag-reorder preview. No DOM here (unit-tested).
 *
 * A drop stores one thing: the note's place in the section's order. Where the
 * card then *sits* is whatever the masonry makes of that order — so a preview
 * is only honest if it offers the positions the flow can actually produce.
 * Those are exactly the slots the dragged card would take when inserted before
 * each of the remaining cards: greedy packing puts a card into the shortest
 * column after its prefix, and that prefix is untouched by the insertion, so
 * `slots[k]` below is where the card lands if it is dropped before `cards[k]`.
 * Preview one of those and the drop cannot move the card afterwards.
 *
 * The rest of the preview stays local: the cards this one displaces slide down
 * their column, nobody re-packs, and the whole thing is a pure function of the
 * pointer over geometry frozen at dragstart — so it can never feed back into
 * itself and thrash. Cards *after* the drop point settle into their final
 * packing when the new order lands, which is Keep's behavior too: the note
 * goes where you dropped it and the others rearrange to accommodate it.
 */

import type { MasonryLayout, MasonryRect } from './masonry.js';
import { layoutMasonry } from './masonry.js';

export interface DragCard {
  id: string;
  height: number;
}

export interface DragSnapshot {
  /** The dragged note. Never one of `cards`. */
  dragId: string;
  /** Height the dragged card takes up in this section's flow. */
  dragHeight: number;
  cols: number;
  cardW: number;
  gutter: number;
  /** The section's other cards, in order. */
  cards: DragCard[];
  /** The grid exactly as rendered at dragstart, dragged card included. */
  rects: Map<string, MasonryRect>;
  /** The dragged card's own slot; null when it comes from the other section. */
  home: MasonryRect | null;
  /**
   * Every slot the dragged card can reach: `slots[k]` is where it lands when
   * dropped before `cards[k]`, and the last entry is where it lands appended.
   */
  slots: MasonryRect[];
  containerHeight: number;
}

/** What the grid renders mid-drag: positions only, no packing state. */
export type PreviewLayout = Pick<MasonryLayout, 'rects' | 'containerHeight'>;

/** A reachable slot, and the order that puts the card in it. */
export interface DropTarget {
  /** Insert before this note; null appends to the end of the section. */
  beforeId: string | null;
  x: number;
  y: number;
}

/** Same-column always beats a nearer slot one column over. */
const OTHER_COLUMN = 1e7;

function colOf(x: number, step: number): number {
  return Math.round(x / step);
}

export function sameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.beforeId === b.beforeId && a.x === b.x && a.y === b.y;
}

/**
 * Freezes the section as rendered, plus the slots the dragged card can reach.
 * `rendered` is this section's live layout — the preview starts from it so that
 * picking a card up moves nothing at all.
 */
export function buildDragSnapshot(
  cards: DragCard[],
  dragId: string,
  dragHeight: number,
  cols: number,
  cardW: number,
  gutter: number,
  rendered: MasonryLayout,
): DragSnapshot {
  // A card inserted before cards[k] goes into the shortest column left by the
  // cards ahead of it — which the insertion does not touch — so it lands
  // exactly where cards[k] sits once the dragged card is out of the flow.
  const gapless = layoutMasonry(cards, cols, cardW, gutter);
  const slots = cards.map((c) => gapless.rects.get(c.id) ?? { x: 0, y: 0 });
  let end = 0;
  for (let c = 1; c < gapless.colHeights.length; c++) {
    if (gapless.colHeights[c]! < gapless.colHeights[end]!) end = c;
  }
  slots.push({ x: end * (cardW + gutter), y: gapless.colHeights[end] ?? 0 });
  return {
    dragId,
    dragHeight,
    cols,
    cardW,
    gutter,
    cards,
    rects: rendered.rects,
    home: rendered.rects.get(dragId) ?? null,
    slots,
    containerHeight: rendered.containerHeight,
  };
}

/** The order that leaves the card in `slots[index]`. */
export function targetForIndex(snap: DragSnapshot, index: number): DropTarget {
  const k = Math.min(Math.max(index, 0), snap.cards.length);
  const slot = snap.slots[k] ?? { x: 0, y: 0 };
  return { beforeId: snap.cards[k]?.id ?? null, x: slot.x, y: slot.y };
}

/**
 * The reachable slot nearest the pointer, preferring the column it is over.
 * Pure in the pointer, so a pointer at rest holds the preview still.
 */
export function dragTargetAt(snap: DragSnapshot, px: number, py: number): DropTarget {
  const step = snap.cardW + snap.gutter;
  const pointerCol = Math.min(Math.max(Math.floor(px / step), 0), snap.cols - 1);
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let k = 0; k < snap.slots.length; k++) {
    const slot = snap.slots[k]!;
    const penalty = colOf(slot.x, step) === pointerCol ? 0 : OTHER_COLUMN;
    const score = penalty + Math.abs(slot.y + snap.dragHeight / 2 - py);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return targetForIndex(snap, best);
}

/**
 * The frozen section with the dragged card moved to `target`: its own column
 * closes the hole it left, the target column opens a gap. Only those columns
 * move, by one card height — no re-packing. `target === null` (the pointer is
 * over the other section) leaves the section exactly as it was.
 *
 * Aimed at the card's own slot this is the identity, so a drag that has not
 * asked for anything yet — a card just picked up — is perfectly still.
 */
export function previewLayout(snap: DragSnapshot, target: DropTarget | null): PreviewLayout {
  const step = snap.cardW + snap.gutter;
  const rects = new Map(snap.rects);
  if (target === null) return { rects, containerHeight: snap.containerHeight };

  const shift = snap.dragHeight + snap.gutter;
  const homeCol = snap.home === null ? -1 : colOf(snap.home.x, step);
  const targetCol = colOf(target.x, step);
  let bottom = target.y + snap.dragHeight;
  for (const card of snap.cards) {
    const rect = snap.rects.get(card.id);
    if (!rect) continue;
    const cardCol = colOf(rect.x, step);
    // Close up behind the card…
    let y =
      snap.home !== null && cardCol === homeCol && rect.y > snap.home.y ? rect.y - shift : rect.y;
    // …and open the gap ahead of it. The slot's top is a card's top, so `>=`
    // catches that card too; the epsilon only guards fractional heights.
    if (cardCol === targetCol && y >= target.y - 0.5) y += shift;
    rects.set(card.id, { x: rect.x, y });
    bottom = Math.max(bottom, y + card.height);
  }
  rects.set(snap.dragId, { x: target.x, y: target.y });
  return { rects, containerHeight: bottom };
}

/**
 * Where the drop lands in the section's order. Resolved by id against the live
 * list rather than a frozen index, so a note that arrived or left during the
 * drag cannot shift the insert point; null means the anchor is gone and the
 * drop should be dropped.
 */
export function insertIndexFor(ids: string[], target: DropTarget): number | null {
  if (target.beforeId === null) return ids.length;
  const i = ids.indexOf(target.beforeId);
  return i === -1 ? null : i;
}
