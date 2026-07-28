import sanitizeHtml from 'sanitize-html';

// Pure text↔html conversions live in @openkeep/shared (the MCP package needs
// them too); re-exported here so server modules keep a single import site.
export { htmlToPlainText, plainTextToHtml } from '@openkeep/shared';

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

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function detectLinks(text: string): boolean {
  return URL_RE.test(text);
}
