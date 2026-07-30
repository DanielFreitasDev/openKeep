/**
 * Pure geometry for the drag-reorder preview. No DOM here (unit-tested).
 *
 * The grid must NOT re-run the masonry while a card is being dragged. Greedy
 * shortest-column packing is chaotic under a one-position change — moving a
 * card a single slot re-picks the column of everything after it — so laying
 * out the would-be final order on every pointer move throws the whole grid
 * around, and because the hovered card moves out from under the pointer the
 * preview then flips back and forth between two orders.
 *
 * Keep's preview is local instead: every card stays exactly where it was when
 * the drag started, the cards below the dragged card's old slot close up, and
 * the cards below the drop point slide down by the gap the card will occupy.
 * One column moves, by one card height, and nothing else — so the motion is
 * smooth and, because it is a pure function of the pointer over a snapshot
 * frozen at dragstart, it can never feed back into itself.
 *
 * The real masonry runs once, on drop, when the new order lands.
 */

import type { MasonryLayout, MasonryRect } from './masonry.js';

/** A card at its dragstart slot. */
export interface DragItem {
  id: string;
  x: number;
  y: number;
  height: number;
}

export interface DragSnapshot {
  /** The dragged note — absent from `items` when it comes from the other section. */
  dragId: string;
  /** Height the dragged card takes up in this section's flow. */
  dragHeight: number;
  cols: number;
  cardW: number;
  gutter: number;
  /** Every card of the section, at its dragstart slot. */
  items: DragItem[];
  containerHeight: number;
}

/** Where the gap is open, and the order that dropping there means. */
export interface DropTarget {
  col: number;
  /** Top of the gap, in grid coordinates. */
  y: number;
  /** Insert before this note; null when the gap sits past its column's last card. */
  beforeId: string | null;
  /** Insert after this note; null when the column holds no other card. */
  afterId: string | null;
}

function colOf(x: number, step: number): number {
  return Math.round(x / step);
}

export function sameDropTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.col === b.col && a.y === b.y && a.beforeId === b.beforeId && a.afterId === b.afterId;
}

/**
 * The gap the pointer is asking for. Rows are measured in *closed-up*
 * coordinates — the column the card came from already counted as if the card
 * were gone — so every threshold is fixed for the whole drag and the pointer
 * decides the target on its own.
 */
export function dragTargetAt(snap: DragSnapshot, px: number, py: number): DropTarget {
  const step = snap.cardW + snap.gutter;
  const shift = snap.dragHeight + snap.gutter;
  const col = Math.min(snap.cols - 1, Math.max(0, Math.floor(px / step)));
  const dragged = snap.items.find((i) => i.id === snap.dragId) ?? null;
  const draggedCol = dragged ? colOf(dragged.x, step) : -1;
  const closedY = (item: DragItem) =>
    dragged !== null && colOf(item.x, step) === draggedCol && item.y > dragged.y
      ? item.y - shift
      : item.y;

  const column = snap.items
    .filter((i) => i.id !== snap.dragId && colOf(i.x, step) === col)
    .sort((a, b) => a.y - b.y);

  for (let i = 0; i < column.length; i++) {
    const item = column[i]!;
    const y = closedY(item);
    if (py < y + item.height / 2) {
      return { col, y, beforeId: item.id, afterId: i > 0 ? column[i - 1]!.id : null };
    }
  }
  const last = column[column.length - 1];
  return {
    col,
    y: last ? closedY(last) + last.height + snap.gutter : 0,
    beforeId: null,
    afterId: last?.id ?? null,
  };
}

/**
 * The snapshot with the hole closed and the gap open. `target === null` (the
 * pointer is outside this section) means the grid stands still.
 */
export function previewLayout(snap: DragSnapshot, target: DropTarget | null): MasonryLayout {
  const step = snap.cardW + snap.gutter;
  const shift = snap.dragHeight + snap.gutter;
  const rects = new Map<string, MasonryRect>();

  if (target === null) {
    for (const item of snap.items) rects.set(item.id, { x: item.x, y: item.y });
    return { rects, containerHeight: snap.containerHeight };
  }

  const dragged = snap.items.find((i) => i.id === snap.dragId) ?? null;
  const draggedCol = dragged ? colOf(dragged.x, step) : -1;
  let bottom = 0;
  for (const item of snap.items) {
    if (item.id === snap.dragId) continue;
    let y = item.y;
    if (dragged !== null && colOf(item.x, step) === draggedCol && item.y > dragged.y) y -= shift;
    // The gap's top is a card's closed-up top, so `>=` catches that card too;
    // the epsilon only guards fractional measured heights.
    if (colOf(item.x, step) === target.col && y >= target.y - 0.5) y += shift;
    rects.set(item.id, { x: item.x, y });
    bottom = Math.max(bottom, y + item.height);
  }
  rects.set(snap.dragId, { x: target.col * step, y: target.y });
  bottom = Math.max(bottom, target.y + snap.dragHeight);
  return { rects, containerHeight: bottom };
}

/**
 * Where the drop lands in the section's order. Ids are resolved against the
 * live list rather than a frozen index, so a note that arrived or left during
 * the drag cannot shift the insert point; null means the anchors are gone and
 * the drop should be dropped.
 */
export function insertIndexFor(ids: string[], target: DropTarget): number | null {
  if (target.beforeId !== null) {
    const i = ids.indexOf(target.beforeId);
    if (i !== -1) return i;
  }
  if (target.afterId !== null) {
    const i = ids.indexOf(target.afterId);
    if (i !== -1) return i + 1;
  }
  return target.beforeId === null && target.afterId === null ? ids.length : null;
}
