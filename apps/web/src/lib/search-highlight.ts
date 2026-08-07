import { foldForFind, type TextMatch } from './find-in-note.js';

/**
 * Painting the search words on the result cards. The rule has to be the one
 * the search itself used — `matchesWords` (note-selectors) is a word-prefix
 * match — or a card would come back from a search with nothing marked on it,
 * or worse, with the wrong half of a word marked.
 *
 * Offsets come from `foldForFind` rather than `normalizeForSearch`: only the
 * former keeps the string's length, and here every index has to point back at
 * a character of the original text.
 */

const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordStart(text: string, i: number): boolean {
  const ch = text[i];
  if (ch === undefined || !WORD_CHAR.test(ch)) return false;
  const before = text[i - 1];
  return before === undefined || !WORD_CHAR.test(before);
}

/**
 * Where the query words sit in `folded`, which must already be folded and the
 * same length as the text it stands for. A word only matches at the start of a
 * text word, and the longest query word wins where two of them could match —
 * "ca cafe" marks "cafe" whole rather than leaving "fe" behind.
 */
function rangesIn(folded: string, words: string[]): TextMatch[] {
  const out: TextMatch[] = [];
  for (let i = 0; i < folded.length; i++) {
    if (!isWordStart(folded, i)) continue;
    let length = 0;
    for (const word of words) {
      if (word.length > length && folded.startsWith(word, i)) length = word.length;
    }
    // Every match is a run of word characters, so it stays inside one word and
    // the ranges never overlap — the callers can splice them in order.
    if (length > 0) out.push({ start: i, end: i + length });
  }
  return out;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/** Plain text split into matched and unmatched runs (titles, checklist rows). */
export function highlightSegments(text: string, words: string[]): HighlightSegment[] {
  if (words.length === 0 || text === '') return [{ text, match: false }];
  const ranges = rangesIn(foldForFind(text), words);
  if (ranges.length === 0) return [{ text, match: false }];

  const out: HighlightSegment[] = [];
  let at = 0;
  for (const range of ranges) {
    if (range.start > at) out.push({ text: text.slice(at, range.start), match: false });
    out.push({ text: text.slice(range.start, range.end), match: true });
    at = range.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), match: false });
  return out;
}

// ------------------------------------------------------------------- html

const ENTITY_RE = /&(?:#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/y;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** Stands in for an entity we cannot name: a character no word is made of. */
const UNKNOWN_CHAR = '\ufffc';

/** The one character an entity stands for. */
function entityChar(entity: string): string {
  const body = entity.slice(1, -1);
  if (body.startsWith('#')) {
    const code =
      body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number(body.slice(1));
    if (Number.isInteger(code) && code > 0 && code <= 0x10ffff) {
      const ch = String.fromCodePoint(code);
      // Only single-unit characters can stand in for the entity one-for-one.
      if (ch.length === 1) return ch;
    }
    return UNKNOWN_CHAR;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? UNKNOWN_CHAR;
}

/**
 * A run of body text, cut into atoms: an entity is one atom standing for the
 * one character it means, everything else is a single code unit. Matching then
 * runs over a string with exactly one character per atom, so a match can be
 * spliced back out of the *source* — `&amp;` is never cut in half, and nothing
 * has to be re-escaped on the way out.
 */
function atomize(run: string): { source: string[]; shadow: string } {
  const source: string[] = [];
  let shadow = '';
  let at = 0;
  while (at < run.length) {
    if (run[at] === '&') {
      ENTITY_RE.lastIndex = at;
      const entity = ENTITY_RE.exec(run)?.[0];
      if (entity) {
        source.push(entity);
        shadow += entityChar(entity);
        at += entity.length;
        continue;
      }
    }
    source.push(run[at] as string);
    shadow += run[at];
    at += 1;
  }
  return { source, shadow };
}

function highlightRun(run: string, words: string[]): string {
  if (run === '') return run;
  const { source, shadow } = atomize(run);
  const ranges = rangesIn(foldForFind(shadow), words);
  if (ranges.length === 0) return run;

  let out = '';
  let at = 0;
  for (const range of ranges) {
    out += source.slice(at, range.start).join('');
    out += `<mark class="search-match">${source.slice(range.start, range.end).join('')}</mark>`;
    at = range.end;
  }
  return out + source.slice(at).join('');
}

/**
 * The same marks inside the card's body html. The input is the server's
 * sanitized allowlist html, so the scan only has to tell tags from text: a `<`
 * opens a tag that is copied through untouched (attribute values carry their
 * own `>` escaped), and everything between tags is body text.
 *
 * The only thing added is `<mark>`, which is phrasing content and legal
 * wherever text already was — the html stays as safe as it arrived.
 */
export function highlightHtml(html: string, words: string[]): string {
  if (words.length === 0 || html === '') return html;
  let out = '';
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open === -1) {
      out += highlightRun(html.slice(at), words);
      break;
    }
    out += highlightRun(html.slice(at, open), words);
    const close = html.indexOf('>', open);
    // An unclosed tag is not text: hand the rest over as it stands rather than
    // marking words inside what is still markup.
    if (close === -1) {
      out += html.slice(open);
      break;
    }
    out += html.slice(open, close + 1);
    at = close + 1;
  }
  return out;
}
