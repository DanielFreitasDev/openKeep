/**
 * Pure text ↔ note-html conversions shared by the server (FTS, export,
 * convert) and the MCP package (plain-text tool surface). The html side is the
 * sanitized allowlist (see NOTE_HTML_TAGS) — markdown structure that carries
 * meaning when flattened (list bullets, table columns, code) survives;
 * decoration (headings, emphasis, links, rules) does not.
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

/** Containers whose own close tag already supplies the line break. */
const ITEM_TAGS = new Set(['li', 'th', 'td']);

/** True when this `</p>` (or `</h*>`) is the last thing inside its item or cell. */
function endsItem(tokens: HtmlToken[], i: number): boolean {
  const next = tokens[i + 1];
  return next?.kind === 'close' && ITEM_TAGS.has(next.tag);
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
  // A row is one line: inside a cell every break the html carries becomes a
  // space, or a paragraph in a cell would tear the columns apart.
  let cellDepth = 0;
  let cellIndex = 0;

  const write = (text: string) => {
    if (text === '') return;
    if (pendingMarker !== null) {
      out += pendingMarker;
      pendingMarker = null;
    }
    out += text;
  };

  const newline = () => {
    out += cellDepth > 0 ? ' ' : '\n';
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
        newline();
      } else if (tag === 'hr') {
        newline();
      } else if (tag === 'ul' || tag === 'ol') {
        // A nested list starts on its own line, under its parent item's text.
        if (lists.length > 0) newline();
        lists.push({ ordered: tag === 'ol', index: Number(token.attrs.start ?? '1') - 1 });
      } else if (tag === 'li') {
        pendingMarker = itemMarker(lists);
      } else if (tag === 'pre') {
        preDepth++;
      } else if (tag === 'tr') {
        cellIndex = 0;
      } else if (tag === 'th' || tag === 'td') {
        // Columns keep a separator so a flattened row still reads as a row.
        if (cellIndex > 0) out += ' | ';
        cellIndex++;
        cellDepth++;
      }
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      lists.pop();
      newline();
    } else if (tag === 'pre') {
      preDepth = Math.max(0, preDepth - 1);
      newline();
    } else if (tag === 'li') {
      pendingMarker = null;
      newline();
    } else if (tag === 'th' || tag === 'td') {
      cellDepth = Math.max(0, cellDepth - 1);
    } else if (NOTE_BLOCK_TAGS.has(tag)) {
      // A paragraph closing an item or a cell already got its break from the
      // container's own close tag.
      if (!endsItem(tokens, i)) newline();
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
