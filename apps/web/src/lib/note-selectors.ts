import type { Collaborator, FullNote, NoteSort } from '@openkeep/shared';
import { comparePositions } from '@openkeep/shared';

export interface MainSections {
  pinned: FullNote[];
  others: FullNote[];
}

const byPosition = (a: FullNote, b: FullNote) => comparePositions(a, b);

/** ISO-8601 UTC compares lexicographically, so newest-first is a plain reverse. */
const byNewest = (key: 'updatedAt' | 'createdAt') => (a: FullNote, b: FullNote) =>
  b[key].localeCompare(a[key]) || byPosition(a, b);

/**
 * Untitled notes have no place in an alphabet, so they fall to the end in
 * manual order rather than crowding the top as a block of empty strings.
 */
const byTitle = (a: FullNote, b: FullNote) => {
  if ((a.title === '') !== (b.title === '')) return a.title === '' ? 1 : -1;
  return (
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) ||
    byPosition(a, b)
  );
};

/**
 * The comparator behind every grid. `manual` is the fractional position — the
 * only order that is stored, and the only one drag-and-drop can rewrite; the
 * others are views over the same corpus, so switching back is lossless.
 */
export function noteComparator(sort: NoteSort = 'manual'): (a: FullNote, b: FullNote) => number {
  switch (sort) {
    case 'edited':
      return byNewest('updatedAt');
    case 'created':
      return byNewest('createdAt');
    case 'title':
      return byTitle;
    default:
      return byPosition;
  }
}

/** Main view: non-archived, non-trashed, split into PINNED / OTHERS. */
export function selectMain(notes: FullNote[], sort?: NoteSort): MainSections {
  const cmp = noteComparator(sort);
  const pinned: FullNote[] = [];
  const others: FullNote[] = [];
  for (const n of notes) {
    if (n.trashedAt !== null || n.archived) continue;
    (n.pinned ? pinned : others).push(n);
  }
  pinned.sort(cmp);
  others.sort(cmp);
  return { pinned, others };
}

/** Archive view: archived, non-trashed, flat. */
export function selectArchived(notes: FullNote[], sort?: NoteSort): FullNote[] {
  return notes.filter((n) => n.trashedAt === null && n.archived).sort(noteComparator(sort));
}

/** Trash view: most recently trashed first (its own order — the sort preference does not apply). */
export function selectTrashed(notes: FullNote[]): FullNote[] {
  return notes
    .filter((n) => n.trashedAt !== null && n.role === 'owner')
    .sort((a, b) => (b.trashedAt ?? '').localeCompare(a.trashedAt ?? '') || byPosition(a, b));
}

export function selectById(notes: FullNote[], id: string): FullNote | undefined {
  return notes.find((n) => n.id === id);
}

/** Reminders view: notes with my reminder, upcoming first (done last) — likewise unsorted by preference. */
export function selectReminders(notes: FullNote[]): FullNote[] {
  return notes
    .filter((n) => n.trashedAt === null && n.reminder !== null)
    .sort((a, b) => {
      if (a.reminder!.done !== b.reminder!.done) return a.reminder!.done ? 1 : -1;
      const ea = a.reminder!.snoozedUntil ?? a.reminder!.remindAt;
      const eb = b.reminder!.snoozedUntil ?? b.reminder!.remindAt;
      return ea.localeCompare(eb);
    });
}

/** Label view: non-trashed notes carrying the label, pinned split like main. */
export function selectByLabel(notes: FullNote[], labelId: string, sort?: NoteSort): MainSections {
  return selectMain(
    notes.filter((n) => n.labelIds.includes(labelId)),
    sort,
  );
}

/**
 * Label state across a multi-selection: a label is `checked` when every note
 * carries it and `mixed` when only some do (Keep renders the latter as an
 * indeterminate box, and clicking it applies the label to the whole selection).
 */
export function selectBulkLabels(notes: FullNote[]): { checked: string[]; mixed: string[] } {
  const counts = new Map<string, number>();
  for (const n of notes) {
    for (const id of new Set(n.labelIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const checked: string[] = [];
  const mixed: string[] = [];
  for (const [id, count] of counts) (count === notes.length ? checked : mixed).push(id);
  return { checked, mixed };
}

// ---------------------------------------------------------------- search

export interface SearchFilters {
  q: string;
  type?: 'list' | 'url' | 'image' | 'audio' | 'drawing' | 'reminder' | undefined;
  labelId?: string | undefined;
  color?: string | undefined;
  collaboratorId?: string | undefined;
}

/**
 * Everyone I share a note with, deduped across the corpus — the "People"
 * filter tiles. Trashed notes are excluded so a person only lingers while a
 * live note still ties us together; I am never my own filter.
 */
export function selectPeople(notes: FullNote[], myId: string | undefined): Collaborator[] {
  const people = new Map<string, Collaborator>();
  for (const n of notes) {
    if (n.trashedAt !== null) continue;
    for (const c of n.collaborators) {
      if (c.userId !== myId) people.set(c.userId, c);
    }
  }
  return [...people.values()].sort((a, b) =>
    (a.name || a.email).localeCompare(b.name || b.email, undefined, { sensitivity: 'base' }),
  );
}

/** Accent-fold + lowercase (client twin of the server's unaccent config). */
export function normalizeForSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const WORD_SEPARATORS = /[^\p{L}\p{N}]+/u;

/**
 * Tokenizing a note means stripping its html and folding every accent, which
 * is far too much work to redo for all of them on every keystroke. Notes are
 * immutable in the cache — an edit produces a new object — so the tokens can
 * be cached against the note itself and die with it.
 */
const wordsCache = new WeakMap<FullNote, string[]>();

function noteSearchWords(n: FullNote): string[] {
  const cached = wordsCache.get(n);
  if (cached) return cached;
  const body = n.bodyHtml.replace(/<[^>]+>/g, ' ');
  const items = n.items.map((i) => i.text).join(' ');
  const words = normalizeForSearch(`${n.title} ${body} ${items}`)
    .split(WORD_SEPARATORS)
    .filter(Boolean);
  wordsCache.set(n, words);
  return words;
}

/** Query words, normalized once per search rather than once per note. */
function queryWords(q: string): string[] {
  return normalizeForSearch(q).split(WORD_SEPARATORS).filter(Boolean);
}

function matchesWords(n: FullNote, words: string[]): boolean {
  if (words.length === 0) return true;
  const textWords = noteSearchWords(n);
  return words.every((w) => textWords.some((tw) => tw.startsWith(w)));
}

/** Word-prefix match: every query word must prefix some text word. */
export function matchesQuery(n: FullNote, q: string): boolean {
  return matchesWords(n, queryWords(q));
}

export interface SearchResults {
  active: FullNote[];
  archived: FullNote[];
}

/** Instant client-side search over the corpus (Keep behavior). */
export function selectSearch(notes: FullNote[], f: SearchFilters, sort?: NoteSort): SearchResults {
  const hasAny = f.q.trim() !== '' || f.type || f.labelId || f.color || f.collaboratorId;
  if (!hasAny) return { active: [], archived: [] };

  const words = queryWords(f.q);
  const matched = notes.filter((n) => {
    if (n.trashedAt !== null) return false;
    if (f.type === 'list' && n.type !== 'list') return false;
    if (f.type === 'url' && !n.hasLinks) return false;
    if (
      (f.type === 'image' || f.type === 'audio' || f.type === 'drawing') &&
      !n.attachments.some((a) => a.kind === f.type)
    )
      return false;
    if (f.type === 'reminder' && n.reminder === null) return false;
    if (f.labelId && !n.labelIds.includes(f.labelId)) return false;
    if (f.color && n.color !== f.color) return false;
    if (f.collaboratorId && !n.collaborators.some((c) => c.userId === f.collaboratorId))
      return false;
    return matchesWords(n, words);
  });

  const cmp = noteComparator(sort);
  return {
    active: matched.filter((n) => !n.archived).sort(cmp),
    archived: matched.filter((n) => n.archived).sort(cmp),
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
