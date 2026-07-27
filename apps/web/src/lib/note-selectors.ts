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

/** Label view: non-trashed notes carrying the label, pinned split like main. */
export function selectByLabel(notes: FullNote[], labelId: string): MainSections {
  return selectMain(notes.filter((n) => n.labelIds.includes(labelId)));
}

// ---------------------------------------------------------------- search

export interface SearchFilters {
  q: string;
  type?: 'list' | 'url' | 'image' | 'audio' | 'drawing' | 'reminder' | undefined;
  labelId?: string | undefined;
  color?: string | undefined;
}

/** Accent-fold + lowercase (client twin of the server's unaccent config). */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function noteSearchText(n: FullNote): string {
  const body = n.bodyHtml.replace(/<[^>]+>/g, ' ');
  const items = n.items.map((i) => i.text).join(' ');
  return normalizeForSearch(`${n.title} ${body} ${items}`);
}

/** Word-prefix match: every query word must prefix some text word. */
export function matchesQuery(n: FullNote, q: string): boolean {
  const words = normalizeForSearch(q)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return true;
  const textWords = noteSearchText(n).split(/[^\p{L}\p{N}]+/u);
  return words.every((w) => textWords.some((tw) => tw.startsWith(w)));
}

export interface SearchResults {
  active: FullNote[];
  archived: FullNote[];
}

/** Instant client-side search over the corpus (Keep behavior). */
export function selectSearch(notes: FullNote[], f: SearchFilters): SearchResults {
  const hasAny = f.q.trim() !== '' || f.type || f.labelId || f.color;
  if (!hasAny) return { active: [], archived: [] };

  const matched = notes.filter((n) => {
    if (n.trashedAt !== null) return false;
    if (f.type === 'list' && n.type !== 'list') return false;
    if (f.type === 'url' && !n.hasLinks) return false;
    if (
      (f.type === 'image' || f.type === 'audio' || f.type === 'drawing') &&
      !n.attachments.some((a) => a.kind === f.type)
    )
      return false;
    // reminder filter gains data in M6.
    if (f.type === 'reminder') return false;
    if (f.labelId && !n.labelIds.includes(f.labelId)) return false;
    if (f.color && n.color !== f.color) return false;
    return matchesQuery(n, f.q);
  });

  return {
    active: matched.filter((n) => !n.archived).sort(byPosition),
    archived: matched.filter((n) => n.archived).sort(byPosition),
  };
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
