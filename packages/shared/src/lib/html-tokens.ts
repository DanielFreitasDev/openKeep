/**
 * A tag walker for note html — the only html this repo ever parses.
 *
 * Note bodies are machine-produced (TipTap on the way in, `sanitizeNoteHtml`
 * on the way out): a closed allowlist of tags, quoted attributes, no comments,
 * no scripts, no raw `<` in text. That contract is narrow enough that a real
 * parser would be dead weight in the web bundle, so the two consumers that
 * need structure — plain text (FTS, counters, snippets) and markdown
 * serialization — share this instead of each hand-rolling regexes.
 */

export interface HtmlOpenToken {
  kind: 'open';
  tag: string;
  attrs: Record<string, string>;
}
export interface HtmlCloseToken {
  kind: 'close';
  tag: string;
}
export interface HtmlTextToken {
  kind: 'text';
  text: string;
}
export type HtmlToken = HtmlOpenToken | HtmlCloseToken | HtmlTextToken;

/** Tags that never carry children; a lone `open` token stands for the whole element. */
export const VOID_TAGS = new Set(['br', 'hr', 'img']);

const TAG_RE =
  /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-a-zA-Z0-9_:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'`=<>]+))?)*)\s*\/?>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

/** Entity decoding for text nodes (named set the sanitizer emits + numeric). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+|#39);/g, (match, body: string) => {
    const named = NAMED_ENTITIES[body];
    if (named !== undefined) return named;
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Attribute-value escaping (adds the quote on top of `escapeHtml`). */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (raw.trim() === '') return attrs;
  ATTR_RE.lastIndex = 0;
  let match = ATTR_RE.exec(raw);
  while (match !== null) {
    const [, name, dq, sq, bare] = match;
    if (name) attrs[name.toLowerCase()] = decodeEntities(dq ?? sq ?? bare ?? '');
    match = ATTR_RE.exec(raw);
  }
  return attrs;
}

/** Splits note html into open/close/text tokens (entities already decoded). */
export function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let last = 0;
  TAG_RE.lastIndex = 0;
  let match = TAG_RE.exec(html);
  while (match !== null) {
    if (match.index > last) {
      tokens.push({ kind: 'text', text: decodeEntities(html.slice(last, match.index)) });
    }
    const closing = match[1] === '/';
    const tag = (match[2] ?? '').toLowerCase();
    if (closing) {
      if (!VOID_TAGS.has(tag)) tokens.push({ kind: 'close', tag });
    } else {
      tokens.push({ kind: 'open', tag, attrs: parseAttrs(match[3] ?? '') });
    }
    last = match.index + match[0].length;
    match = TAG_RE.exec(html);
  }
  if (last < html.length) {
    tokens.push({ kind: 'text', text: decodeEntities(html.slice(last)) });
  }
  return tokens;
}
