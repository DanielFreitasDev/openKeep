import type { NoteItem } from '@openkeep/shared';
import { positionBetween } from '@openkeep/shared';

/** Local checklist row: `id` is null until the server confirms creation. */
export interface ChecklistRow {
  key: string;
  id: string | null;
  text: string;
  checked: boolean;
  indent: 0 | 1;
  position: string;
}

export const byPosition = (a: ChecklistRow, b: ChecklistRow) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : a.key < b.key ? -1 : 1;

/** Split text at the caret (Enter inside an item). */
export function splitText(text: string, caret: number): [string, string] {
  return [text.slice(0, caret), text.slice(caret)];
}

/** Keep rule: the FIRST item can never be indented. */
export function canIndent(rows: ChecklistRow[], key: string): boolean {
  const ordered = [...rows].sort(byPosition);
  const idx = ordered.findIndex((r) => r.key === key);
  return idx > 0;
}

/** Position for a row inserted after `afterKey` (null = start). */
export function positionAfterRow(rows: ChecklistRow[], afterKey: string | null): string {
  const ordered = [...rows].sort(byPosition);
  if (afterKey === null) {
    return positionBetween(null, ordered[0]?.position ?? null);
  }
  const idx = ordered.findIndex((r) => r.key === afterKey);
  const prev = ordered[idx];
  const next = ordered[idx + 1];
  return positionBetween(prev?.position ?? null, next?.position ?? null);
}

/** Position for a row moved to display index `to` (excluding itself). */
export function positionAtIndex(rows: ChecklistRow[], movingKey: string, to: number): string {
  const ordered = [...rows].sort(byPosition).filter((r) => r.key !== movingKey);
  const prev = ordered[to - 1];
  const next = ordered[to];
  return positionBetween(prev?.position ?? null, next?.position ?? null);
}

/**
 * Local mirror of the server cascade: toggling an indent-0 parent applies the
 * same `checked` to its contiguous following indent-1 run.
 */
export function applyCheck(
  rows: ChecklistRow[],
  key: string,
  checked: boolean,
): { rows: ChecklistRow[]; cascadedKeys: string[] } {
  const ordered = [...rows].sort(byPosition);
  const idx = ordered.findIndex((r) => r.key === key);
  const target = ordered[idx];
  if (!target) return { rows, cascadedKeys: [] };

  const affected = new Set<string>([key]);
  if (target.indent === 0) {
    for (let i = idx + 1; i < ordered.length; i++) {
      const child = ordered[i]!;
      if (child.indent !== 1) break;
      affected.add(child.key);
    }
  }
  return {
    rows: rows.map((r) => (affected.has(r.key) ? { ...r, checked } : r)),
    cascadedKeys: [...affected].filter((k) => k !== key),
  };
}

/**
 * `applyCheck` over raw items — the card preview toggles boxes without the
 * editor's local row state, and must cascade identically.
 */
export function checkItemWithCascade(
  items: NoteItem[],
  itemId: string,
  checked: boolean,
): NoteItem[] {
  const { rows } = applyCheck(
    items.map((i) => ({ ...i, key: i.id })),
    itemId,
    checked,
  );
  const nextChecked = new Map(rows.map((r) => [r.key, r.checked]));
  return items.map((i) => {
    const next = nextChecked.get(i.id) ?? i.checked;
    return next === i.checked ? i : { ...i, checked: next };
  });
}

export interface DisplayGroups {
  unchecked: ChecklistRow[];
  checked: ChecklistRow[];
}

/** Display order: with move-to-bottom, checked rows group below; else inline. */
export function displayGroups(rows: ChecklistRow[], moveCheckedToBottom: boolean): DisplayGroups {
  const ordered = [...rows].sort(byPosition);
  if (!moveCheckedToBottom) return { unchecked: ordered, checked: [] };
  return {
    unchecked: ordered.filter((r) => !r.checked),
    checked: ordered.filter((r) => r.checked),
  };
}
