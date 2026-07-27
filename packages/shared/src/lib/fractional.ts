import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Fractional ordering positions. Stored as `text COLLATE "C"` and compared
 * bytewise; every move is a single-row write. Ties broken by (position, id).
 */
export function positionBetween(a: string | null, b: string | null): string {
  return generateKeyBetween(a, b);
}

/** First position in an empty sequence, or one before `first`. */
export function positionBefore(first: string | null): string {
  return generateKeyBetween(null, first);
}

/** One after `last` (append). */
export function positionAfter(last: string | null): string {
  return generateKeyBetween(last, null);
}

/** N evenly assignable positions between two bounds (bulk import/copy). */
export function positionsBetween(a: string | null, b: string | null, n: number): string[] {
  return generateNKeysBetween(a, b, n);
}

/** Comparator matching the DB's COLLATE "C" bytewise order, with id tiebreak. */
export function comparePositions(
  a: { position: string; id: string },
  b: { position: string; id: string },
): number {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}
