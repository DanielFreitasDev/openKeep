/**
 * Session undo/redo for the two surfaces TipTap does not cover: the note
 * title and the checklist items, both native textareas with no history of
 * their own beyond the browser's per-field one (which the controlled item
 * inputs defeat anyway).
 *
 * A step is a whole snapshot rather than an inverse operation: the item ops
 * are already a small algebra (add, split, merge, check with cascade, indent,
 * reorder, uncheck-all, delete-checked) and inverting each of them is eight
 * chances to be subtly wrong, where restoring "how it read" is one.
 * Snapshots address rows by their LOCAL key, never by server id — a row that
 * an undo brings back is a new row server-side, and later steps have to keep
 * pointing at it.
 */

/** One checklist row as a step remembers it. */
export interface HistoryItem {
  key: string;
  text: string;
  checked: boolean;
  indent: 0 | 1;
  position: string;
}

export interface FieldSnapshot {
  title: string;
  /** null on a text note — the body is TipTap's, with its own history. */
  items: readonly HistoryItem[] | null;
}

export interface FieldHistory {
  readonly past: readonly FieldSnapshot[];
  readonly future: readonly FieldSnapshot[];
  /** The state the last recorded step left behind. */
  readonly present: FieldSnapshot;
  /** Open coalescing group: consecutive typing in one field is one step. */
  readonly group: { key: string; at: number } | null;
}

/** Steps kept per editing session; the oldest fall off the ring. */
export const HISTORY_LIMIT = 100;

/** Keystrokes closer together than this in the same field share a step. */
export const HISTORY_GROUP_MS = 500;

export function createHistory(present: FieldSnapshot): FieldHistory {
  return { past: [], future: [], present, group: null };
}

function sameItems(a: readonly HistoryItem[] | null, b: readonly HistoryItem[] | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      y !== undefined &&
      x.key === y.key &&
      x.text === y.text &&
      x.checked === y.checked &&
      x.indent === y.indent &&
      x.position === y.position
    );
  });
}

export function sameSnapshot(a: FieldSnapshot, b: FieldSnapshot): boolean {
  return a.title === b.title && sameItems(a.items, b.items);
}

/**
 * Record the state a local edit just produced. `groupKey` names the field the
 * edit landed in (null for structural changes, which never coalesce): typing
 * on within the same field and the same half-second extends the open step
 * instead of pushing a new one, the way ProseMirror groups its own.
 */
export function recordStep(
  history: FieldHistory,
  next: FieldSnapshot,
  groupKey: string | null,
  now: number,
): FieldHistory {
  if (sameSnapshot(history.present, next)) return history;
  const group = groupKey === null ? null : { key: groupKey, at: now };
  if (
    groupKey !== null &&
    history.group?.key === groupKey &&
    now - history.group.at < HISTORY_GROUP_MS
  ) {
    return { ...history, present: next, future: [], group };
  }
  const past = [...history.past, history.present];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
    present: next,
    group,
  };
}

/**
 * Step back. `live` is the note as it reads *now*, not the recorded present:
 * a collaborator's edit can land between two steps without being one, and
 * pushing what is actually on screen onto the redo stack is what keeps their
 * change from being resurrected by a later redo.
 */
export function undoStep(history: FieldHistory, live: FieldSnapshot): FieldHistory | null {
  const present = history.past.at(-1);
  if (present === undefined) return null;
  return {
    past: history.past.slice(0, -1),
    future: [...history.future, live],
    present,
    group: null,
  };
}

export function redoStep(history: FieldHistory, live: FieldSnapshot): FieldHistory | null {
  const present = history.future.at(-1);
  if (present === undefined) return null;
  return {
    past: [...history.past, live],
    future: history.future.slice(0, -1),
    present,
    group: null,
  };
}
