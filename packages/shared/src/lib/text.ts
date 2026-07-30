/**
 * Pure text ↔ note-html conversions shared by the server (FTS, export,
 * convert) and the MCP package (plain-text tool surface). The html side is the
 * sanitized allowlist (see NOTE_HTML_TAGS) — markdown structure that carries
 * meaning when flattened (list bullets, code) survives; decoration (headings,
 * emphasis, links, rules) does not.
 */

import { NOTE_BLOCK_TAGS } from '../constants/note-html.js';
import { type HtmlToken, tokenizeHtml } from './html-tokens.js';

interface ListFrame {
  ordered: boolean;
  index: number;
}

/** Marker + indent for a list item, given the open `ul`/`ol` frames around it. */
function itemMarker(stack: ListFrame[]): string {
  const frame = stack[stack.length - 1];
  const indent = '  '.repeat(Math.max(0, stack.length - 1));
  if (!frame) return indent;
  if (!frame.ordered) return `${indent}- `;
  frame.index += 1;
  return `${indent}${frame.index}. `;
}

/** True when this `</p>` (or `</h*>`) is the last thing inside its list item. */
function endsItem(tokens: HtmlToken[], i: number): boolean {
  const next = tokens[i + 1];
  return next?.kind === 'close' && next.tag === 'li';
}

/** Plain text derived from sanitized note html (FTS + .txt export + card previews). */
export function htmlToPlainText(html: string): string {
  const tokens = tokenizeHtml(html);
  const lists: ListFrame[] = [];
  let out = '';
  // Bullets are held back until the item has content, so `<li><p>x</p></li>`
  // renders as `- x` instead of a bullet stranded on its own line.
  let pendingMarker: string | null = null;
  let preDepth = 0;

  const write = (text: string) => {
    if (text === '') return;
    if (pendingMarker !== null) {
      out += pendingMarker;
      pendingMarker = null;
    }
    out += text;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind === 'text') {
      write(token.text.replaceAll(' ', ' '));
      continue;
    }
    const { tag } = token;
    if (token.kind === 'open') {
      if (tag === 'br') {
        write('');
        out += '\n';
      } else if (tag === 'hr') {
        out += '\n';
      } else if (tag === 'ul' || tag === 'ol') {
        // A nested list starts on its own line, under its parent item's text.
        if (lists.length > 0) out += '\n';
        lists.push({ ordered: tag === 'ol', index: Number(token.attrs.start ?? '1') - 1 });
      } else if (tag === 'li') {
        pendingMarker = itemMarker(lists);
      } else if (tag === 'pre') {
        preDepth++;
      }
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      lists.pop();
      out += '\n';
    } else if (tag === 'pre') {
      preDepth = Math.max(0, preDepth - 1);
      out += '\n';
    } else if (tag === 'li') {
      pendingMarker = null;
      out += '\n';
    } else if (NOTE_BLOCK_TAGS.has(tag)) {
      // A paragraph closing an item already got its newline from `</li>`.
      if (!endsItem(tokens, i)) out += '\n';
    }
  }

  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
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
