/**
 * Pure text ↔ note-html conversions shared by the server (FTS, export,
 * convert) and the MCP package (plain-text tool surface). The html side is
 * the sanitized allowlist (h1,h2,p,br,strong,em,u) — see the server's
 * sanitizeNoteHtml.
 */

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
    .replace(/ /g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Plain text → minimal allowlist html (one <p> per line; used by convert/import). */
export function plainTextToHtml(text: string): string {
  const escapeHtml = (s: string) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const lines = text.split('\n');
  if (lines.length === 0) return '';
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}
