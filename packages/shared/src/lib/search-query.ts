/**
 * The search box's query language: `label:`, `color:`, `has:`, `is:`,
 * `before:`/`after:` and `-word`, mixed freely with plain text.
 *
 * It lives in shared because both ends must agree on what a query means: the
 * client filters the corpus instantly (the primary UX) and `/api/search`
 * filters in SQL for large accounts and for the MCP tools. One parser, two
 * executors — a query typed in the box and the same string handed to an agent
 * select the same notes.
 *
 * The vocabulary is English in both locales, like the keys themselves; a
 * localized `marcador:` would have to round-trip through i18n to reach the
 * server, which has no locale.
 *
 * Combination rules (same in both executors): repeated `label:`/`has:` are
 * ANDed (a note carries many labels and many kinds of content), repeated
 * `color:` are ORed (a note has exactly one color, so AND could only ever
 * return nothing), and every negated term is a further AND.
 */

import { NOTE_COLORS, type NoteColor, TAKEOUT_COLOR_MAP } from '../constants/colors.js';

/** Content kinds a note can be filtered by — the `type=` param's vocabulary. */
export const SEARCH_TYPES = [
  'list',
  'url',
  'image',
  'audio',
  'drawing',
  'file',
  'reminder',
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SEARCH_OPERATORS = ['label', 'color', 'has', 'is', 'before', 'after'] as const;
export type SearchOperator = (typeof SEARCH_OPERATORS)[number];

export type SearchTermKind = 'text' | SearchOperator;

export interface SearchTerm {
  kind: SearchTermKind;
  /** Canonical value: `coral`, `url`, `pinned`, `2026-01-01`, or the word. */
  value: string;
  negated: boolean;
  /** The token exactly as typed, so a chip can be removed by rebuilding the query. */
  raw: string;
  /** Position among the query's terms — a chip's identity, since tokens repeat. */
  index: number;
}

export interface SearchQuery {
  /** Every token in order, including plain words — the source for chips. */
  terms: SearchTerm[];
  /** Positive free text (prefix-matched by both executors). */
  text: string[];
  exclude: string[];
  labels: string[];
  notLabels: string[];
  colors: NoteColor[];
  notColors: NoteColor[];
  has: SearchType[];
  notHas: SearchType[];
  pinned?: boolean;
  archived?: boolean;
  /** `YYYY-MM-DD`, exclusive: edited strictly before that UTC day. */
  before?: string;
  /** `YYYY-MM-DD`, inclusive: edited from the start of that UTC day on. */
  after?: string;
  /** Nothing at all to filter by (blank box). */
  isEmpty: boolean;
}

/**
 * `has:` accepts the plural and the everyday word for each kind — someone
 * typing `has:photos` means images and should not silently get a text search.
 */
const HAS_ALIASES: Record<string, SearchType> = {
  list: 'list',
  lists: 'list',
  checklist: 'list',
  todo: 'list',
  url: 'url',
  urls: 'url',
  link: 'url',
  links: 'url',
  image: 'image',
  images: 'image',
  photo: 'image',
  photos: 'image',
  audio: 'audio',
  recording: 'audio',
  drawing: 'drawing',
  drawings: 'drawing',
  file: 'file',
  files: 'file',
  document: 'file',
  documents: 'file',
  pdf: 'file',
  reminder: 'reminder',
  reminders: 'reminder',
};

/**
 * Our color names are the palette's (coral, sand, fog…), but people type the
 * color they see. Takeout already maps the plain words onto the palette, so
 * `color:blue` and `color:fog` are the same filter.
 */
const COLOR_ALIASES: Record<string, NoteColor> = {
  ...Object.fromEntries(NOTE_COLORS.map((c) => [c, c])),
  ...Object.fromEntries(
    Object.entries(TAKEOUT_COLOR_MAP).map(([word, c]) => [word.toLowerCase(), c]),
  ),
  grey: 'chalk',
};

/** `is:` flags, with the explicit negative spelled out (no `-` needed). */
const IS_FLAGS: Record<string, { field: 'pinned' | 'archived'; value: boolean }> = {
  pinned: { field: 'pinned', value: true },
  unpinned: { field: 'pinned', value: false },
  archived: { field: 'archived', value: true },
  unarchived: { field: 'archived', value: false },
};

/**
 * A token is a run of non-space characters in which a quoted stretch may hold
 * spaces, so `label:"to do"` stays one token. An unterminated quote runs to
 * the end of the string — the query is being typed, not malformed.
 */
const TOKEN_RE = /(?:[^\s"]|"[^"]*"?)+/g;

const OPERATOR_RE = /^(-?)([a-zA-Z]+):(.*)$/;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function unquote(value: string): string {
  if (!value.startsWith('"')) return value;
  return value.slice(1, value.endsWith('"') && value.length > 1 ? -1 : undefined);
}

/** A calendar date, not merely a well-shaped one: `2026-02-31` is not a day. */
function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isOperator(key: string): key is SearchOperator {
  return (SEARCH_OPERATORS as readonly string[]).includes(key);
}

/**
 * Reads one token. Anything not understood — an unknown key, an invalid value,
 * `https://example.com` — comes back as plain text: the box must never turn a
 * typo into a filter the user cannot see.
 */
function parseTerm(raw: string): Omit<SearchTerm, 'index'> | null {
  const operator = OPERATOR_RE.exec(raw);
  if (operator) {
    const negated = operator[1] === '-';
    const lowerKey = (operator[2] ?? '').toLowerCase();
    const value = unquote(operator[3] ?? '').trim();
    if (isOperator(lowerKey) && value !== '') {
      // Dates are a point on a line: "not before X" is a range, not a filter.
      const dateOperator = lowerKey === 'before' || lowerKey === 'after';
      if (!(dateOperator && negated)) {
        const canonical = canonicalValue(lowerKey, value);
        if (canonical !== null) return { kind: lowerKey, value: canonical, negated, raw };
      }
    }
  }
  const negated = raw.startsWith('-') && raw.length > 1;
  const value = unquote(negated ? raw.slice(1) : raw).trim();
  if (value === '') return null;
  return { kind: 'text', value, negated, raw };
}

/** The stored form of an operator's value, or null when we don't understand it. */
function canonicalValue(key: SearchOperator, value: string): string | null {
  const lower = value.toLowerCase();
  switch (key) {
    case 'color':
      return COLOR_ALIASES[lower] ?? null;
    case 'has':
      return HAS_ALIASES[lower] ?? null;
    case 'is':
      return IS_FLAGS[lower] ? lower : null;
    case 'before':
    case 'after':
      return isValidDate(lower) ? lower : null;
    // Labels are free text: the name is matched case-insensitively later, and
    // a name nobody has simply matches nothing.
    default:
      return value;
  }
}

/** Parses a raw query string into free text plus filters. Never throws. */
export function parseSearchQuery(q: string): SearchQuery {
  const parsed: SearchQuery = {
    terms: [],
    text: [],
    exclude: [],
    labels: [],
    notLabels: [],
    colors: [],
    notColors: [],
    has: [],
    notHas: [],
    isEmpty: true,
  };

  for (const raw of q.match(TOKEN_RE) ?? []) {
    const term = parseTerm(raw);
    if (!term) continue;
    parsed.terms.push({ ...term, index: parsed.terms.length });
    switch (term.kind) {
      case 'text':
        (term.negated ? parsed.exclude : parsed.text).push(term.value);
        break;
      case 'label':
        (term.negated ? parsed.notLabels : parsed.labels).push(term.value);
        break;
      case 'color':
        (term.negated ? parsed.notColors : parsed.colors).push(term.value as NoteColor);
        break;
      case 'has':
        (term.negated ? parsed.notHas : parsed.has).push(term.value as SearchType);
        break;
      case 'is': {
        const flag = IS_FLAGS[term.value];
        // `-is:pinned` is `is:unpinned`; the last mention of a flag wins.
        if (flag) parsed[flag.field] = term.negated ? !flag.value : flag.value;
        break;
      }
      case 'before':
        parsed.before = term.value;
        break;
      case 'after':
        parsed.after = term.value;
        break;
    }
  }

  parsed.isEmpty = parsed.terms.length === 0;
  return parsed;
}

/** Rebuilds a query string from terms — how a chip's × removes its filter. */
export function formatSearchTerms(terms: SearchTerm[]): string {
  return terms.map((t) => t.raw).join(' ');
}
