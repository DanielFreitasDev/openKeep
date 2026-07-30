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
