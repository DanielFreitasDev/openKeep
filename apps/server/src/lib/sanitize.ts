import sanitizeHtml from 'sanitize-html';

/**
 * Keep web's exact formatting surface (May 2025): H1, H2, normal paragraphs,
 * bold, italic, underline, line breaks. Nothing else — zero attributes.
 * Natural interchange format for TipTap, Takeout import and export.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['h1', 'h2', 'p', 'br', 'strong', 'em', 'u'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  // <b>/<i> normalize to the semantic tags TipTap emits.
  transformTags: {
    b: 'strong',
    i: 'em',
  },
};

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Plain text derived from sanitized note html (FTS + .txt export + card previews). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function detectLinks(text: string): boolean {
  return URL_RE.test(text);
}

/** Plain text → minimal allowlist html (one <p> per line; used by convert/import). */
export function plainTextToHtml(text: string): string {
  const escapeHtml = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const lines = text.split('\n');
  if (lines.length === 0) return '';
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}
