import { NOTE_HTML_TAGS, NOTE_LINK_SCHEMES } from '@openkeep/shared';
import sanitizeHtml from 'sanitize-html';

// Pure text↔html conversions live in @openkeep/shared (the MCP package needs
// them too); re-exported here so server modules keep a single import site.
export { htmlToMarkdown, htmlToPlainText, plainTextToHtml, renderMarkdown } from '@openkeep/shared';

/**
 * The note body vocabulary, enforced. v1.0 mirrored Keep web's formatting
 * surface exactly; the markdown work widened it to what markdown expresses
 * (NOTE_HTML_TAGS, DECISIONS #26) — still with no styling attributes at all.
 *
 * The three attributes that survive are the ones that carry meaning rather
 * than presentation: a link's target, an ordered list's first number, and the
 * code language. Links are additionally scheme-limited (no `javascript:`,
 * no `data:`) and always open in a new tab with the opener severed.
 */
const SAFE_HREF_RE = new RegExp(`^(${NOTE_LINK_SCHEMES.join('|')}):`, 'i');

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...NOTE_HTML_TAGS],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    ol: ['start'],
    code: ['class'],
  },
  allowedClasses: { code: ['language-*'] },
  allowedSchemes: [...NOTE_LINK_SCHEMES],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // <b>/<i> normalize to the semantic tags TipTap emits; <del>/<strike> to <s>.
  transformTags: {
    b: 'strong',
    i: 'em',
    del: 's',
    strike: 's',
    // A link whose href does not survive the scheme check stops being a link
    // at all: `span` is outside the allowlist, so the tag goes and the text
    // stays (an anchor with no href is inert, but also invisible to the user).
    a: (tagName, attribs): sanitizeHtml.Tag => {
      const href = attribs.href ?? '';
      if (!SAFE_HREF_RE.test(href)) return { tagName: 'span', attribs: {} };
      return {
        tagName,
        attribs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' },
      };
    },
  },
};

export function sanitizeNoteHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function detectLinks(text: string): boolean {
  return URL_RE.test(text);
}
