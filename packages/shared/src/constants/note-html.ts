/**
 * The note body vocabulary — one source of truth for the server sanitizer, the
 * TipTap schema, the markdown parser/serializer and the plain-text projection.
 *
 * v1.0 mirrored Keep's May-2025 surface (h1, h2, p, br, strong, em, u). The
 * markdown work widened it to what markdown actually expresses (DECISIONS #26):
 * six heading levels, strikethrough, code, quotes, rules, lists and links.
 * Everything here still carries zero styling attributes — the only attributes
 * allowed anywhere are a[href], ol[start] and the code language class.
 */
export const NOTE_HTML_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'a',
] as const;

/** Link schemes the sanitizer keeps; anything else is dropped as a link. */
export const NOTE_LINK_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * A link from one note to another (the `[[` gesture).
 *
 * It is an ordinary `<a>` carrying the app's own deep link (DECISIONS #13)
 * rather than a bespoke tag or attribute: the vocabulary, the sanitizer, the
 * markdown parser/serializer and the plain-text projection all already know
 * what an anchor is, so the link survives export, import, print, versions and
 * the MCP without any of them learning a new node. Relative on purpose — the
 * modal opens over whatever route is showing, and nothing in a note should
 * hard-code the instance's own origin.
 */
const NOTE_LINK_RE = /^\?note=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The href a note link carries, for a target note id. */
export function noteLinkHref(noteId: string): string {
  return `?note=${noteId}`;
}

/** The note id an href points at, or null when it is not a note link. */
export function parseNoteLinkHref(href: string): string | null {
  return NOTE_LINK_RE.exec(href.trim())?.[1]?.toLowerCase() ?? null;
}

/** Tags that open a new line in the plain-text projection. */
export const NOTE_BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'hr',
  'div',
]);
