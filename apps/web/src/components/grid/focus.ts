/**
 * Arrow-key navigation for the roving tab stop (pure; unit-tested).
 *
 * Masonry has no rows: two neighbouring columns rarely share a y, so "the card
 * below" cannot be an index step. Direction is decided geometrically instead —
 * cards that OVERLAP the current one on the perpendicular axis are the real
 * neighbours (same column for up/down, same band for left/right), and the
 * nearest of those wins.
 *
 * Up/down stay inside the column, full stop: columns end at different heights,
 * and an arrow that leapt sideways at the bottom of one would land somewhere
 * the eye was not. Left/right instead fall back to the nearest card in that
 * half-plane when no card is level, so a column can always be reached — a
 * stagger must never wall a card off. Reading order remains j/k's job.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface FocusRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const VERTICAL: ReadonlySet<Direction> = new Set<Direction>(['up', 'down']);

/** Overlap of two 1-D spans; ≤ 0 means they miss each other. */
function overlap(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart);
}

/**
 * The card an arrow key should move to, or `null` when the edge is reached.
 * `rects` may hold the current card in any order and may be incomplete —
 * virtualized cards outside the render band simply do not exist as targets.
 */
export function nextInDirection(
  rects: readonly FocusRect[],
  fromId: string,
  dir: Direction,
): string | null {
  const from = rects.find((r) => r.id === fromId);
  if (!from) return null;

  const vertical = VERTICAL.has(dir);
  const forward = dir === 'down' || dir === 'right';
  // Distance along the axis we travel, and along the one we drift on.
  const travel = (r: FocusRect) => (vertical ? r.y - from.y : r.x - from.x);
  const drift = (r: FocusRect) => (vertical ? Math.abs(r.x - from.x) : Math.abs(r.y - from.y));

  let aligned: FocusRect | null = null;
  let alignedScore = [0, 0];
  let loose: FocusRect | null = null;
  let looseScore = Number.POSITIVE_INFINITY;

  for (const r of rects) {
    if (r.id === fromId) continue;
    const step = forward ? travel(r) : -travel(r);
    // A card that starts level with (or behind) this one is not "ahead": in a
    // masonry column the next card always starts strictly further along.
    if (step <= 0) continue;
    const inLane =
      overlap(
        vertical ? from.x : from.y,
        vertical ? from.w : from.h,
        vertical ? r.x : r.y,
        vertical ? r.w : r.h,
      ) > 0;
    if (inLane) {
      // In lane: the first card along the axis, ties broken by drift.
      const score = [step, drift(r)];
      if (
        !aligned ||
        score[0]! < alignedScore[0]! ||
        (score[0] === alignedScore[0] && score[1]! < alignedScore[1]!)
      ) {
        aligned = r;
        alignedScore = score;
      }
    } else if (!vertical) {
      // Out of lane: no axis to sort by, so plain proximity decides.
      const score = travel(r) ** 2 + drift(r) ** 2;
      if (score < looseScore) {
        loose = r;
        looseScore = score;
      }
    }
  }

  return (aligned ?? loose)?.id ?? null;
}
