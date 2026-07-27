import type { FullNote } from '@openkeep/shared';
import { comparePositions } from '@openkeep/shared';

export interface MainSections {
  pinned: FullNote[];
  others: FullNote[];
}

const byPosition = (a: FullNote, b: FullNote) => comparePositions(a, b);

/** Main view: non-archived, non-trashed, split into PINNED / OTHERS. */
export function selectMain(notes: FullNote[]): MainSections {
  const pinned: FullNote[] = [];
  const others: FullNote[] = [];
  for (const n of notes) {
    if (n.trashedAt !== null || n.archived) continue;
    (n.pinned ? pinned : others).push(n);
  }
  pinned.sort(byPosition);
  others.sort(byPosition);
  return { pinned, others };
}

/** Archive view: archived, non-trashed, flat. */
export function selectArchived(notes: FullNote[]): FullNote[] {
  return notes.filter((n) => n.trashedAt === null && n.archived).sort(byPosition);
}

/** Trash view: most recently trashed first. */
export function selectTrashed(notes: FullNote[]): FullNote[] {
  return notes
    .filter((n) => n.trashedAt !== null)
    .sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? '') || byPosition(a, b));
}

export function selectById(notes: FullNote[], id: string): FullNote | undefined {
  return notes.find((n) => n.id === id);
}

// ---------------------------------------------------------------- cache ops

export function upsertNote(list: FullNote[] | undefined, note: FullNote): FullNote[] {
  const notes = list ?? [];
  const idx = notes.findIndex((n) => n.id === note.id);
  if (idx === -1) return [...notes, note];
  const next = [...notes];
  next[idx] = note;
  return next;
}

export function mergeNote(
  list: FullNote[] | undefined,
  id: string,
  patch: Partial<FullNote>,
): FullNote[] {
  const notes = list ?? [];
  return notes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

export function removeNote(list: FullNote[] | undefined, id: string): FullNote[] {
  return (list ?? []).filter((n) => n.id !== id);
}
