import type { Attachment, Collaborator, FullNote, NoteSort, SearchType } from '@openkeep/shared';
import { comparePositions, noteLinkHref, parseSearchQuery } from '@openkeep/shared';

/**
 * The picture stack a note shows: images and drawings, in order — minus any
 * photo a drawing was drawn over. That one is already inside the drawing's
 * render, so showing it too would put the same picture on the note twice, once
 * with the ink and once without. It stays attached (and comes back if the
 * drawing is deleted) because it is what makes the drawing re-editable.
 */
export function selectImageStack(attachments: readonly Attachment[]): Attachment[] {
  const backgrounds = new Set(
    attachments.map((a) => a.photoAttachmentId).filter((id) => id !== null),
  );
  return attachments.filter(
    (a) => (a.kind === 'image' || a.kind === 'drawing') && !backgrounds.has(a.id),
  );
}

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

/**
 * Live in some view of the board — everything the trash and the templates
 * shelf have not taken out of it.
 *
 * A template is a note kept for its shape, not for what it says, so it leaves
 * the board whole: no grid, no label, no reminder list, no search, no link
 * target. The trash is the one bucket that outranks it, because a trashed
 * template is still a trashed note and has to be restorable from there.
 */
const onBoard = (n: FullNote) => n.trashedAt === null && !n.isTemplate;

/** Main view: non-archived, non-trashed, split into PINNED / OTHERS. */
export function selectMain(notes: FullNote[], sort?: NoteSort): MainSections {
  const cmp = noteComparator(sort);
  const pinned: FullNote[] = [];
  const others: FullNote[] = [];
  for (const n of notes) {
    if (!onBoard(n) || n.archived) continue;
    (n.pinned ? pinned : others).push(n);
  }
  pinned.sort(cmp);
  others.sort(cmp);
  return { pinned, others };
}

/** Archive view: archived, non-trashed, flat. */
export function selectArchived(notes: FullNote[], sort?: NoteSort): FullNote[] {
  return notes.filter((n) => onBoard(n) && n.archived).sort(noteComparator(sort));
}

/**
 * Templates view: my starting shapes, flat.
 *
 * Sorted like any other grid (the preference applies here too) — a shelf of
 * templates is read the same way a shelf of notes is.
 */
export function selectTemplates(notes: FullNote[], sort?: NoteSort): FullNote[] {
  return notes.filter((n) => n.trashedAt === null && n.isTemplate).sort(noteComparator(sort));
}

/**
 * Whether the shelf has anything on it — the sidebar row and the "from a
 * template" entry points both hide until it does, so nobody who never makes a
 * template ever sees one. A boolean rather than the list: it is read on every
 * render of the shell, and it must not hand out a new array each time.
 */
export function selectHasTemplates(notes: FullNote[]): boolean {
  return notes.some((n) => n.trashedAt === null && n.isTemplate);
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
    .filter((n) => onBoard(n) && n.reminder !== null)
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
  /** The box as typed: free text and operators together (see parseSearchQuery). */
  q: string;
  type?: SearchType | undefined;
  labelId?: string | undefined;
  color?: string | undefined;
  collaboratorId?: string | undefined;
  /**
   * `label:`/`-label:` names already resolved to ids. The corpus carries label
   * ids and nothing else, so the name→id lookup belongs to the caller, which
   * holds the label list; a name nobody has resolves to itself and matches no
   * note, which is the honest answer for `label:typo`.
   */
  labelIds?: string[] | undefined;
  notLabelIds?: string[] | undefined;
}

/**
 * Everyone I share a note with, deduped across the corpus — the "People"
 * filter tiles. Trashed notes are excluded so a person only lingers while a
 * live note still ties us together; I am never my own filter.
 */
export function selectPeople(notes: FullNote[], myId: string | undefined): Collaborator[] {
  const people = new Map<string, Collaborator>();
  for (const n of notes) {
    if (!onBoard(n)) continue;
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

// ------------------------------------------------------------- note links

/** How many notes the `[[` picker offers at once (Keep's label picker scrolls; this one ranks). */
const LINK_TARGET_LIMIT = 8;

/**
 * Candidates for a `[[` link: the corpus minus the trash and minus the note
 * being written in, most recently edited first. Recency rather than the user's
 * sort preference — the note you mean to link is nearly always one you were
 * just in, and the picker shows too few rows for an alphabet to help.
 */
export function selectLinkTargets(notes: FullNote[], excludeId: string | null, q: string) {
  return notes
    .filter((n) => onBoard(n) && n.id !== excludeId && matchesQuery(n, q))
    .sort(byNewest('updatedAt'))
    .slice(0, LINK_TARGET_LIMIT);
}

/**
 * The notes whose body links here — the "mentioned in" panel.
 *
 * The scan is a substring test over the corpus the client already holds, which
 * is the same bet the search makes: a body is html, and the href the sanitizer
 * writes is an exact, quoted shape, so no parsing is needed to tell a link from
 * a note that merely says `?note=…` in its text. Only bodies can carry links —
 * checklist items are plain text — so a list note never appears here as a source.
 */
export function selectBacklinks(notes: FullNote[], noteId: string): FullNote[] {
  const needle = `href="${noteLinkHref(noteId)}"`;
  return notes
    .filter((n) => onBoard(n) && n.id !== noteId && n.bodyHtml.includes(needle))
    .sort(byNewest('updatedAt'));
}

export interface SearchResults {
  active: FullNote[];
  archived: FullNote[];
}

/** Does the note carry this kind of content? (the `type=` chip and `has:`). */
function hasType(n: FullNote, type: SearchType): boolean {
  switch (type) {
    case 'list':
      return n.type === 'list';
    case 'url':
      return n.hasLinks;
    case 'reminder':
      return n.reminder !== null;
    default:
      return n.attachments.some((a) => a.kind === type);
  }
}

/**
 * The edited date as a UTC day, which is what `before:`/`after:` compare —
 * ISO-8601 sorts lexicographically, so the comparison is a string one. UTC
 * rather than the local day so client and server agree on the boundary
 * without either of them doing timezone math.
 */
const editedDay = (n: FullNote) => n.updatedAt.slice(0, 10);

/**
 * Instant client-side search over the corpus (Keep behavior).
 *
 * `revealed` is the session's curtain, and it is a parameter rather than a
 * guess from the note's shape: a protected note is skipped entirely while the
 * curtain is up. Its words are not in the corpus to match anyway, but the card
 * would still answer `is:pinned` or `color:mint` — and "there is a hidden note
 * about this" is precisely what the lock refuses to say.
 */
export function selectSearch(
  notes: FullNote[],
  f: SearchFilters,
  sort?: NoteSort,
  revealed = false,
): SearchResults {
  const query = parseSearchQuery(f.q);
  const hasAny = !query.isEmpty || f.type || f.labelId || f.color || f.collaboratorId;
  if (!hasAny) return { active: [], archived: [] };

  const words = queryWords(query.text.join(' '));
  const excluded = queryWords(query.exclude.join(' '));
  const matched = notes.filter((n) => {
    if (!onBoard(n)) return false;
    if (n.locked && !revealed) return false;
    if (f.type && !hasType(n, f.type)) return false;
    if (f.labelId && !n.labelIds.includes(f.labelId)) return false;
    if (f.color && n.color !== f.color) return false;
    if (f.collaboratorId && !n.collaborators.some((c) => c.userId === f.collaboratorId))
      return false;

    if (!query.has.every((type) => hasType(n, type))) return false;
    if (query.notHas.some((type) => hasType(n, type))) return false;
    if (!(f.labelIds ?? []).every((id) => n.labelIds.includes(id))) return false;
    if ((f.notLabelIds ?? []).some((id) => n.labelIds.includes(id))) return false;
    if (query.colors.length > 0 && !query.colors.includes(n.color)) return false;
    if (query.notColors.includes(n.color)) return false;
    if (query.pinned !== undefined && n.pinned !== query.pinned) return false;
    if (query.archived !== undefined && n.archived !== query.archived) return false;
    if (query.before !== undefined && !(editedDay(n) < query.before)) return false;
    if (query.after !== undefined && !(editedDay(n) >= query.after)) return false;

    // An excluded word must not prefix any word of the note — the mirror of
    // the positive match, so `café -moído` behaves like `café` minus those.
    if (excluded.some((w) => matchesWords(n, [w]))) return false;
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
