/** Anything a drag reorders: rows are identified by their local key. */
export interface Keyed {
  key: string;
}

/**
 * The slot a drop lands in, as an index into the list WITHOUT the dragged row
 * — the form `positionAtIndex` and a plain splice both want.
 *
 * `overKey` is the row under the pointer, `before` which half of its box the
 * pointer sits in. Null means the gesture names no new slot — nothing under the
 * pointer, an unknown row, or the dragged row itself — and the caller keeps the
 * slot it already had. That last case is what keeps the live preview stable:
 * the lifted row travels under the pointer as a drop target of its own, and
 * reading it as "go back home" would fight the preview it just produced.
 */
export function dropSlot<T extends Keyed>(
  items: readonly T[],
  dragKey: string,
  overKey: string,
  before: boolean,
): number | null {
  if (overKey === dragKey) return null;
  const from = items.findIndex((i) => i.key === dragKey);
  const over = items.findIndex((i) => i.key === overKey);
  if (from === -1 || over === -1) return null;
  const to = before ? over : over + 1;
  // The dragged row comes out of the list first, so every slot below where it
  // sat shifts up one.
  return to > from ? to - 1 : to;
}

/** `items` with the dragged row lifted out and dropped back in at slot `to`. */
export function moveToSlot<T extends Keyed>(items: readonly T[], dragKey: string, to: number): T[] {
  const next = [...items];
  const from = next.findIndex((i) => i.key === dragKey);
  if (from === -1) return next;
  const [moved] = next.splice(from, 1);
  if (!moved) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}
