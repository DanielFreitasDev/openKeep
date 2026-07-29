/**
 * Pure geometry for Keep's drag-select marquee: the box spanned by two page
 * points and the cards it touches. No DOM here (unit-tested).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BoxedNote {
  id: string;
  box: Box;
}

/** Pointer travel that turns a press on the background into a marquee. */
export const MARQUEE_THRESHOLD = 6;

export function boxFromPoints(a: Point, b: Point): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Overlap test, edges included: a perfectly horizontal or vertical drag spans a
 * zero-height/zero-width box and must still sweep the cards it crosses.
 */
export function boxesIntersect(a: Box, b: Box): boolean {
  return (
    a.left <= b.left + b.width &&
    a.left + a.width >= b.left &&
    a.top <= b.top + b.height &&
    a.top + a.height >= b.top
  );
}

export function notesInBox(box: Box, candidates: BoxedNote[]): string[] {
  return candidates.filter((c) => boxesIntersect(box, c.box)).map((c) => c.id);
}

export function passedThreshold(a: Point, b: Point, threshold = MARQUEE_THRESHOLD): boolean {
  return Math.abs(a.x - b.x) >= threshold || Math.abs(a.y - b.y) >= threshold;
}
