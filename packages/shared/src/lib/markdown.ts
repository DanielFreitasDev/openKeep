/**
 * Markdown → note html.
 *
 * Hand-rolled rather than a parser dependency, for the same reason the v1.0
 * version was (DECISIONS #26): the target is a fixed vocabulary the sanitizer
 * enforces on the way in, so a general parser would spend bundle weight
 * producing nodes that get dropped. What changed is the size of that
 * vocabulary — headings 1–6, emphasis, strikethrough, inline code, fenced
 * code, quotes, rules, bullet/ordered lists, links and GFM tables — so this
 * file grew from a line rewriter into a real block + inline parser.
 *
 * A CommonMark subset, deliberately: no reference links, no setext headings
 * (`---` under text stays a rule — the surprising reading in a notes app), no
 * indented code blocks (four leading spaces are wrapped prose more often than
 * they are code), no raw html beyond `<u>` (the one tag markdown cannot
 * express and the note vocabulary has).
 *
 * Constructs outside the subset survive as the characters the user typed —
 * quietly losing pasted content is worse than pasting it verbatim.
 */

import { NOTE_LINK_SCHEMES, parseNoteLinkHref } from '../constants/note-html.js';
import { escapeAttr, escapeHtml } from './html-tokens.js';

/** Guards pathological nesting (deep quotes/lists, adversarial emphasis). */
const MAX_DEPTH = 12;

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\n]*?)[ \t]*$/;
const RULE_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
/** Hashes then whitespace (or nothing) — `#tag` is a label, never a heading. */
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*(?:[ \t]#+[ \t]*)?$/;
const QUOTE_RE = /^ {0,3}>[ \t]?(.*)$/;
const ITEM_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*)|)$/;
/** A `|---|` row: cells of dashes, with the alignment colons GFM allows. */
const TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const PUNCT_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const LANG_RE = /^[\w+#.-]{1,24}$/;

interface Ctx {
  /** Whether anything markdown-specific fired — drives the paste decision. */
  matched: boolean;
}

const isBlank = (line: string) => line.trim() === '';
const indentOf = (line: string) => line.length - line.trimStart().length;

/** A list item that is allowed to interrupt a paragraph (CommonMark's rule). */
function itemInterrupts(match: RegExpExecArray): boolean {
  const marker = match[2] ?? '';
  const content = match[4] ?? '';
  if (content.trim() === '') return false;
  return /^[-*+]$/.test(marker) || /^1[.)]$/.test(marker);
}

/**
 * A table starts at a header row followed by a `|---|` row. Both lines have to
 * carry a pipe: without that rule `a` over `---` — a setext heading in
 * CommonMark, a rule here — would turn into a one-column table, and a line
 * that already opens another block (a bullet, a quote, a heading) keeps that
 * reading, so `- a | b` over `- | -` stays the two-item list it looks like.
 */
function tableAt(lines: string[], i: number): boolean {
  const header = lines[i];
  const delimiter = lines[i + 1];
  if (header === undefined || delimiter === undefined) return false;
  if (!header.includes('|') || !delimiter.includes('|')) return false;
  if (!TABLE_DELIM_RE.test(delimiter)) return false;
  return !(
    FENCE_RE.test(header) ||
    HEADING_RE.test(header) ||
    QUOTE_RE.test(header) ||
    ITEM_RE.test(header)
  );
}

/** True when the line opens a block and therefore ends the paragraph above it. */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]!;
  if (FENCE_RE.test(line) || RULE_RE.test(line) || HEADING_RE.test(line) || QUOTE_RE.test(line)) {
    return true;
  }
  if (tableAt(lines, i)) return true;
  const item = ITEM_RE.exec(line);
  return item !== null && itemInterrupts(item);
}

// ------------------------------------------------------------------ inline

/** Backtick code span: n backticks … n backticks, contents kept verbatim. */
function codeSpan(src: string, start: number): { html: string; next: number } | null {
  let run = 0;
  while (src[start + run] === '`') run++;
  const fence = '`'.repeat(run);
  const close = src.indexOf(fence, start + run);
  if (close === -1) return null;
  // A longer run than the opener is not a closer (`` a ``` b `` stays open).
  if (src[close + run] === '`') return null;
  let content = src.slice(start + run, close);
  // CommonMark strips one space on each side, so `` ` `` can hold a backtick.
  if (content.length > 1 && content.startsWith(' ') && content.endsWith(' ')) {
    content = content.slice(1, -1);
  }
  return { html: `<code>${escapeHtml(content)}</code>`, next: close + run };
}

/**
 * http/https/mailto only — anything else renders as the text the user typed.
 * The one relative form allowed is a note link (`?note=<uuid>`), which is how
 * a `[[` link comes back from an exported `.md` as a link rather than as text.
 */
function safeUrl(raw: string): string | null {
  const url = raw.trim().replace(/^<(.*)>$/s, '$1');
  if (url === '' || /[\s<>]/.test(url)) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)?.[1]?.toLowerCase();
  if (scheme === undefined) return parseNoteLinkHref(url) === null ? null : url;
  return (NOTE_LINK_SCHEMES as readonly string[]).includes(scheme) ? url : null;
}

/** Matching `]` for the `[` at `start`, honouring nesting, escapes and code. */
function closingBracket(src: string, start: number): number {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
    } else if (c === '`') {
      const span = codeSpan(src, i);
      if (span) i = span.next - 1;
    } else if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** `[text](dest "title")`, and `![alt](src)` which degrades to a named link. */
function linkAt(
  src: string,
  start: number,
  ctx: Ctx,
  depth: number,
): { html: string; next: number } | null {
  const image = src[start] === '!';
  const open = image ? start + 1 : start;
  if (src[open] !== '[') return null;
  const close = closingBracket(src, open);
  if (close === -1 || src[close + 1] !== '(') return null;

  let i = close + 2;
  let paren = 1;
  let dest = '';
  for (; i < src.length; i++) {
    const c = src[i]!;
    if (c === '\\' && i + 1 < src.length) {
      dest += src[++i];
      continue;
    }
    if (c === '(') paren++;
    if (c === ')') {
      paren--;
      if (paren === 0) break;
    }
    dest += c;
  }
  if (paren !== 0) return null;

  // Trailing "title" / 'title' is parsed off and dropped (nothing renders it).
  const withoutTitle = dest.replace(/[ \t]+(?:"[^"]*"|'[^']*')[ \t]*$/, '').trim();
  const url = safeUrl(withoutTitle);
  const label = src.slice(open + 1, close);
  if (url === null) return null;

  ctx.matched = true;
  const text = label.trim() === '' ? escapeHtml(url) : inline(label, ctx, depth + 1);
  return { html: `<a href="${escapeAttr(url)}">${text}</a>`, next: i + 1 };
}

interface Run {
  char: string;
  length: number;
  canOpen: boolean;
  canClose: boolean;
}

/**
 * Emphasis delimiter run. Intraword runs are rejected for `*` as well as `_`
 * — CommonMark allows `a*b*c`, but in note prose `2*3*4` and `a_b_c` are far
 * more common than intentional intraword emphasis.
 */
function runAt(src: string, i: number): Run | null {
  const char = src[i]!;
  if (char !== '*' && char !== '_' && char !== '~') return null;
  let length = 1;
  while (src[i + length] === char) length++;
  if (char === '~' && length !== 2) return null;
  const before = src[i - 1];
  const after = src[i + length];
  const wordBefore = before !== undefined && /[\wÀ-￿]/.test(before);
  const wordAfter = after !== undefined && /[\wÀ-￿]/.test(after);
  return {
    char,
    length,
    canOpen: after !== undefined && !/\s/.test(after) && !wordBefore,
    canClose: before !== undefined && !/\s/.test(before) && !wordAfter,
  };
}

/** Index just past the run that closes the opener at `start`, or -1. */
function findCloser(src: string, start: number, open: Run): number {
  let i = start + open.length;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '`') {
      const span = codeSpan(src, i);
      if (span) {
        i = span.next;
        continue;
      }
    }
    const run = runAt(src, i);
    if (!run || run.char !== open.char) {
      i += run?.length ?? 1;
      continue;
    }
    if (run.canClose && run.length >= open.length && i > start + open.length) return i;
    if (run.canOpen) {
      // A nested opener: jump past its own span so `*a **b** c*` closes last.
      const nested = findCloser(src, i, run);
      i = nested === -1 ? i + run.length : nested + run.length;
      continue;
    }
    i += run.length;
  }
  return -1;
}

const EMPHASIS_TAGS: Record<number, [string, string]> = {
  1: ['<em>', '</em>'],
  2: ['<strong>', '</strong>'],
  3: ['<em><strong>', '</strong></em>'],
};

function emphasisAt(
  src: string,
  i: number,
  ctx: Ctx,
  depth: number,
): { html: string; next: number } | null {
  const open = runAt(src, i);
  if (!open?.canOpen || depth >= MAX_DEPTH) return null;
  const close = findCloser(src, i, open);
  if (close === -1) return null;

  const content = src.slice(i + open.length, close);
  if (content.trim() === '') return null;
  ctx.matched = true;
  const inner = inline(content, ctx, depth + 1);
  if (open.char === '~') return { html: `<s>${inner}</s>`, next: close + 2 };

  const used = Math.min(open.length, 3);
  const [openTag, closeTag] = EMPHASIS_TAGS[used] ?? EMPHASIS_TAGS[1]!;
  return { html: `${openTag}${inner}${closeTag}`, next: close + used };
}

/** Inline markdown → html. Everything unmatched is emitted as escaped text. */
function inline(src: string, ctx: Ctx, depth = 0): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;

    if (c === '\\') {
      const next = src[i + 1];
      if (next !== undefined && PUNCT_RE.test(next)) {
        ctx.matched = true;
        out += escapeHtml(next);
        i += 2;
        continue;
      }
    }

    if (c === '`') {
      const span = codeSpan(src, i);
      if (span) {
        ctx.matched = true;
        out += span.html;
        i = span.next;
        continue;
      }
    }

    if (c === '<') {
      // The one raw-html exception: markdown cannot express underline.
      const tag = /^<(\/?)u>/i.exec(src.slice(i));
      if (tag) {
        ctx.matched = true;
        out += tag[1] === '/' ? '</u>' : '<u>';
        i += tag[0].length;
        continue;
      }
      const auto = /^<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]+)>/.exec(src.slice(i));
      const autoUrl = auto?.[1] !== undefined ? safeUrl(auto[1]) : null;
      if (auto && autoUrl !== null) {
        ctx.matched = true;
        out += `<a href="${escapeAttr(autoUrl)}">${escapeHtml(autoUrl)}</a>`;
        i += auto[0].length;
        continue;
      }
      out += '&lt;';
      i++;
      continue;
    }

    if (c === '[' || (c === '!' && src[i + 1] === '[')) {
      const link = linkAt(src, i, ctx, depth);
      if (link) {
        out += link.html;
        i = link.next;
        continue;
      }
    }

    if (c === '*' || c === '_' || c === '~') {
      const emphasis = emphasisAt(src, i, ctx, depth);
      if (emphasis) {
        out += emphasis.html;
        i = emphasis.next;
        continue;
      }
    }

    out += escapeHtml(c);
    i++;
  }
  return out;
}

/** Paragraph lines → one block; a single newline stays a `<br>`, like the editor. */
function paragraph(lines: string[], ctx: Ctx, depth: number): string {
  const html = lines
    // Trailing double space / backslash is markdown's hard break — already one.
    .map((line) => inline(line.replace(/(?: {2,}|\\)$/, '').trim(), ctx, depth))
    .join('<br>');
  return html === '' ? '' : `<p>${html}</p>`;
}

// ------------------------------------------------------------------ blocks

function fencedCode(lines: string[], start: number, ctx: Ctx): { html: string; next: number } {
  const [, marker = '```', info = ''] = FENCE_RE.exec(lines[start]!) ?? [];
  const fenceChar = marker[0]!;
  const body: string[] = [];
  let i = start + 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const closing = new RegExp(`^ {0,3}\\${fenceChar}{${marker.length},}[ \\t]*$`).test(line);
    if (closing) {
      i++;
      break;
    }
    body.push(line);
  }
  const lang = info.split(/\s+/)[0] ?? '';
  const attr = LANG_RE.test(lang) ? ` class="language-${escapeAttr(lang)}"` : '';
  ctx.matched = true;
  return { html: `<pre><code${attr}>${escapeHtml(body.join('\n'))}</code></pre>`, next: i };
}

function blockquote(lines: string[], start: number, ctx: Ctx, depth: number) {
  const inner: string[] = [];
  let i = start;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const quoted = QUOTE_RE.exec(line);
    if (quoted) {
      inner.push(quoted[1] ?? '');
      continue;
    }
    // Lazy continuation: plain prose right under a quote stays in the quote.
    if (isBlank(line) || startsBlock(lines, i)) break;
    inner.push(line.trim());
  }
  ctx.matched = true;
  return { html: `<blockquote>${renderBlocks(inner, ctx, depth + 1)}</blockquote>`, next: i };
}

/** Drops the leading `<p>` of an item so tight bullets don't gain a block. */
function unwrapFirstParagraph(html: string): string {
  if (!html.startsWith('<p>')) return html;
  const close = html.indexOf('</p>');
  if (close === -1) return html;
  return html.slice(3, close) + html.slice(close + 4);
}

function list(lines: string[], start: number, ctx: Ctx, depth: number) {
  const first = ITEM_RE.exec(lines[start]!)!;
  const ordered = /\d/.test(first[2] ?? '');
  const startNumber = ordered ? Number.parseInt(first[2] ?? '1', 10) : 1;
  const sameKind = (marker: string) => /\d/.test(marker) === ordered;

  const items: string[][] = [];
  let current: string[] | null = null;
  let contentIndent = 0;
  let blanks = 0;
  let i = start;

  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (isBlank(line)) {
      blanks++;
      // Two blank lines end any list; one may still be a loose item gap.
      if (blanks >= 2) break;
      continue;
    }
    const indent = indentOf(line);
    const item = ITEM_RE.exec(line);

    if (item && indent < contentIndent && !sameKind(item[2] ?? '')) break;

    if (item && (current === null || indent < contentIndent)) {
      const marker = item[2] ?? '';
      const gap = Math.min((item[3] ?? ' ').length, 4);
      contentIndent = indent + marker.length + gap;
      current = [item[4] ?? ''];
      items.push(current);
      blanks = 0;
      continue;
    }
    if (current === null) break;

    if (indent >= contentIndent) {
      if (blanks > 0) current.push('');
      current.push(line.slice(contentIndent));
      blanks = 0;
      continue;
    }
    // Lazy continuation of the item's paragraph.
    if (blanks === 0 && !startsBlock(lines, i)) {
      current.push(line.trim());
      continue;
    }
    break;
  }

  const body = items
    .map((item) => `<li>${unwrapFirstParagraph(renderBlocks(item, ctx, depth + 1))}</li>`)
    .join('');
  ctx.matched = true;
  const openTag = ordered ? `<ol${startNumber !== 1 ? ` start="${startNumber}"` : ''}>` : '<ul>';
  return { html: `${openTag}${body}${ordered ? '</ol>' : '</ul>'}`, next: i };
}

/**
 * One table row → its cells, trimmed.
 *
 * The leading and trailing pipes are borders rather than empty cells, and
 * `\|` is a pipe *in* a cell: GFM resolves that escape before any inline
 * parsing, which is why it is undone here and not left to `inline` — inside a
 * code span nothing is unescaped, and `` `a|b` `` has to survive as typed.
 */
function tableCells(line: string): string[] {
  const row = line.trim();
  const cells: string[] = [];
  let current = '';
  let pipe = false;
  for (let i = row.startsWith('|') ? 1 : 0; i < row.length; i++) {
    const char = row[i]!;
    const next = row[i + 1];
    if (char === '\\' && next !== undefined) {
      current += next === '|' ? '|' : char + next;
      i++;
      pipe = false;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      pipe = true;
      continue;
    }
    current += char;
    pipe = false;
  }
  if (!pipe) cells.push(current.trim());
  return cells;
}

/**
 * A GFM table. The header row fixes the width — later rows are padded and
 * truncated to it, as GFM does — and cells hold inline content only: a table
 * that can nest a quote or a list stops being one of the simple tables this
 * note vocabulary has (DECISIONS #37). Alignment colons are read and dropped,
 * because a cell carries no attributes.
 */
function table(lines: string[], start: number, ctx: Ctx, depth: number) {
  const headers = tableCells(lines[start]!);
  const rows: string[][] = [];
  let i = start + 2;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (isBlank(line) || !line.includes('|') || startsBlock(lines, i)) break;
    rows.push(tableCells(line));
  }

  const cell = (tag: 'th' | 'td', text: string) =>
    `<${tag}>${inline(text, ctx, depth + 1)}</${tag}>`;
  const head = headers.map((text) => cell('th', text)).join('');
  const body = rows
    .map((row) => `<tr>${headers.map((_, column) => cell('td', row[column] ?? '')).join('')}</tr>`)
    .join('');
  ctx.matched = true;
  return { html: `<table><tbody><tr>${head}</tr>${body}</tbody></table>`, next: i };
}

function renderBlocks(lines: string[], ctx: Ctx, depth: number): string {
  if (depth > MAX_DEPTH)
    return paragraph(
      lines.filter((l) => !isBlank(l)),
      ctx,
      depth,
    );
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }

    if (FENCE_RE.test(line)) {
      const code = fencedCode(lines, i, ctx);
      out.push(code.html);
      i = code.next;
      continue;
    }

    if (RULE_RE.test(line)) {
      ctx.matched = true;
      out.push('<hr>');
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      ctx.matched = true;
      out.push(`<h${level}>${inline((heading[2] ?? '').trim(), ctx, depth)}</h${level}>`);
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote = blockquote(lines, i, ctx, depth);
      out.push(quote.html);
      i = quote.next;
      continue;
    }

    if (tableAt(lines, i)) {
      const grid = table(lines, i, ctx, depth);
      out.push(grid.html);
      i = grid.next;
      continue;
    }

    const item = ITEM_RE.exec(line);
    if (item && (item[4] ?? '').trim() !== '') {
      const parsed = list(lines, i, ctx, depth);
      out.push(parsed.html);
      i = parsed.next;
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]!) &&
      (para.length === 0 || !startsBlock(lines, i))
    ) {
      para.push(lines[i]!);
      i++;
    }
    const html = paragraph(para, ctx, depth);
    if (html !== '') out.push(html);
  }

  return out.join('');
}

/**
 * Markdown → note html, always. Used by import and by callers that already
 * know the text is markdown.
 */
export function renderMarkdown(text: string): string {
  const ctx: Ctx = { matched: false };
  return renderBlocks(text.replace(/\r\n?/g, '\n').split('\n'), ctx, 0);
}

/**
 * Markdown → note html, or `null` when the text carries no markdown at all —
 * the paste path then leaves the text to the editor's plain-text handling
 * instead of round-tripping it through here.
 */
export function markdownToHtml(text: string): string | null {
  const ctx: Ctx = { matched: false };
  const html = renderBlocks(text.replace(/\r\n?/g, '\n').split('\n'), ctx, 0);
  return ctx.matched ? html : null;
}
