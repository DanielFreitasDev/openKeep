/**
 * Note html → markdown, the inverse of `markdownToHtml`.
 *
 * Drives `.md` export (single note and the backup zip), the version snapshots
 * (so restoring a formatted note is lossless) and the MCP body surface. It
 * walks the token stream into a small tree first: markdown needs to know a
 * block's children before it can prefix them (`> `, list indents), which a
 * streaming pass cannot do.
 */

import { type HtmlToken, tokenizeHtml, VOID_TAGS } from './html-tokens.js';

interface ElementNode {
  kind: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
interface TextNode {
  kind: 'text';
  text: string;
}
type Node = ElementNode | TextNode;

const BLOCK_TAGS = new Set([
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
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
]);

function buildTree(tokens: HtmlToken[]): Node[] {
  const root: ElementNode = { kind: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  for (const token of tokens) {
    const top = stack[stack.length - 1]!;
    if (token.kind === 'text') {
      if (token.text !== '') top.children.push({ kind: 'text', text: token.text });
      continue;
    }
    if (token.kind === 'open') {
      const node: ElementNode = {
        kind: 'element',
        tag: token.tag,
        attrs: token.attrs,
        children: [],
      };
      top.children.push(node);
      if (!VOID_TAGS.has(token.tag)) stack.push(node);
      continue;
    }
    // Unbalanced close tags simply pop to the nearest matching ancestor.
    const at = stack.findLastIndex((node) => node.tag === token.tag);
    if (at > 0) stack.length = at;
  }
  return root.children;
}

/** Escapes only what would otherwise parse as markup when read back. */
function escapeText(text: string): string {
  return (
    text
      .replaceAll('\\', '\\\\')
      .replaceAll('`', '\\`')
      .replaceAll('*', '\\*')
      // `_` is only a delimiter at word boundaries, so snake_case stays readable.
      .replace(/(^|[^\wÀ-￿])_/g, '$1\\_')
      .replace(/_(?=[^\wÀ-￿]|$)/g, '\\_')
      .replace(/~~/g, '\\~\\~')
      .replace(/\[(?=[^\]]*\]\()/g, '\\[')
      .replace(/<(?=[a-zA-Z/])/g, '\\<')
  );
}

/** Line starts that would read as a block marker get a backslash. */
function escapeLineStart(line: string): string {
  return line.replace(/^([ \t]*)(#{1,6}[ \t]|>|[-+][ \t]|\d{1,9}[.)][ \t])/, '$1\\$2');
}

function textOf(nodes: Node[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text' ? node.text : node.tag === 'br' ? '\n' : textOf(node.children),
    )
    .join('');
}

/** Fence long enough to survive backticks inside the span. */
function codeFence(content: string): string {
  const longest = [...content.matchAll(/`+/g)].reduce((max, m) => Math.max(max, m[0].length), 0);
  return '`'.repeat(longest + 1);
}

function inlineOf(nodes: Node[]): string {
  let out = '';
  for (const node of nodes) {
    if (node.kind === 'text') {
      out += escapeText(node.text);
      continue;
    }
    switch (node.tag) {
      case 'br':
        // Two trailing spaces: the hard break every markdown reader agrees on.
        out += '  \n';
        break;
      case 'strong':
      case 'b':
        out += `**${inlineOf(node.children)}**`;
        break;
      case 'em':
      case 'i':
        out += `*${inlineOf(node.children)}*`;
        break;
      case 's':
      case 'del':
      case 'strike':
        out += `~~${inlineOf(node.children)}~~`;
        break;
      case 'u':
        // Markdown has no underline; the note vocabulary does.
        out += `<u>${inlineOf(node.children)}</u>`;
        break;
      case 'code': {
        const content = textOf(node.children);
        const fence = codeFence(content);
        const pad = content.startsWith('`') || content.endsWith('`') ? ' ' : '';
        out += `${fence}${pad}${content}${pad}${fence}`;
        break;
      }
      case 'a': {
        const href = node.attrs.href ?? '';
        const label = inlineOf(node.children);
        if (href === '') out += label;
        else if (label === escapeText(href)) out += `<${href}>`;
        else out += `[${label}](${href})`;
        break;
      }
      default:
        out += inlineOf(node.children);
    }
  }
  return out;
}

function prefixLines(text: string, first: string, rest: string): string {
  return text
    .split('\n')
    .map((line, i) => {
      const prefix = i === 0 ? first : rest;
      return line === '' ? prefix.trimEnd() : prefix + line;
    })
    .join('\n');
}

function listBlock(node: ElementNode, depth: number): string {
  const ordered = node.tag === 'ol';
  let index = Number.parseInt(node.attrs.start ?? '1', 10);
  if (!Number.isFinite(index)) index = 1;
  const rendered: string[] = [];
  for (const child of node.children) {
    if (child.kind !== 'element' || child.tag !== 'li') continue;
    const marker = ordered ? `${index++}. ` : '- ';
    const body = blocksOf(child.children, depth + 1, true);
    rendered.push(prefixLines(body === '' ? '' : body, marker, ' '.repeat(marker.length)));
  }
  return rendered.join('\n');
}

/** Rows of a table, seeing through the `thead`/`tbody` wrappers around them. */
function tableRows(node: ElementNode): ElementNode[] {
  const rows: ElementNode[] = [];
  for (const child of node.children) {
    if (child.kind !== 'element') continue;
    if (child.tag === 'tr') rows.push(child);
    else if (child.tag === 'thead' || child.tag === 'tbody') rows.push(...tableRows(child));
  }
  return rows;
}

/**
 * One cell, on one line. A markdown table has no syntax for a break inside a
 * cell, so anything the html stacked in there collapses to spaces, and a pipe
 * has to be escaped or it would open a column that is not there.
 */
function cellOf(node: ElementNode): string {
  return inlineOf(node.children)
    .replace(/\s*\n\s*/g, ' ')
    .replaceAll('|', '\\|')
    .trim();
}

/**
 * A GFM table: header row, `| --- |` row, body. The first row is the header
 * whether or not it is spelled with `th` — markdown has no headerless table,
 * and the editor always makes one.
 */
function tableBlock(node: ElementNode): string {
  const rows = tableRows(node);
  if (rows.length === 0) return '';
  const cellsOf = (row: ElementNode) =>
    row.children.filter(
      (child): child is ElementNode =>
        child.kind === 'element' && (child.tag === 'th' || child.tag === 'td'),
    );
  const width = Math.max(...rows.map((row) => cellsOf(row).length));
  if (width === 0) return '';

  const line = (row: ElementNode) => {
    const cells = cellsOf(row);
    return `| ${Array.from({ length: width }, (_, i) => {
      const cell = cells[i];
      return cell ? cellOf(cell) : '';
    }).join(' | ')} |`;
  };
  const [header, ...body] = rows;
  return [line(header!), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`]
    .concat(body.map(line))
    .join('\n');
}

function blocksOf(nodes: Node[], depth: number, inListItem = false): string {
  const out: string[] = [];
  // Sub-lists of an item hug the line above them — that is what makes the
  // list tight, and it is how the parser reads it back.
  const tight = new Set<number>();
  // Text and marks sitting directly in a block container (a tight `<li>`).
  let loose: Node[] = [];
  const flushLoose = () => {
    if (loose.length === 0) return;
    const text = inlineOf(loose);
    if (text.trim() !== '') out.push(escapeLineStart(text));
    loose = [];
  };

  for (const node of nodes) {
    if (node.kind === 'text' || !BLOCK_TAGS.has(node.tag)) {
      loose.push(node);
      continue;
    }
    flushLoose();
    const tag = node.tag;
    if (/^h[1-6]$/.test(tag)) {
      const text = inlineOf(node.children).replace(/\n+/g, ' ').trim();
      out.push(`${'#'.repeat(Number(tag[1]))} ${text}`.trimEnd());
    } else if (tag === 'p' || tag === 'div') {
      const text = inlineOf(node.children);
      if (text.trim() !== '') {
        out.push(text.split('\n').map(escapeLineStart).join('\n'));
      } else {
        out.push('');
      }
    } else if (tag === 'hr') {
      out.push('---');
    } else if (tag === 'pre') {
      const content = textOf(node.children).replace(/\n$/, '');
      const code = node.children.find((c) => c.kind === 'element' && c.tag === 'code');
      const lang =
        code?.kind === 'element'
          ? (/language-([\w+#.-]+)/.exec(code.attrs.class ?? '')?.[1] ?? '')
          : '';
      // A fence longer than any run inside keeps embedded fences intact.
      const fence = '`'.repeat(Math.max(3, codeFence(content).length));
      out.push(`${fence}${lang}\n${content}\n${fence}`);
    } else if (tag === 'blockquote') {
      out.push(prefixLines(blocksOf(node.children, depth + 1), '> ', '> '));
    } else if (tag === 'ul' || tag === 'ol') {
      if (inListItem) tight.add(out.length);
      out.push(listBlock(node, depth));
    } else if (tag === 'table') {
      const grid = tableBlock(node);
      if (grid !== '') out.push(grid);
    } else if (tag === 'li' || tag === 'thead' || tag === 'tbody' || tag === 'tr') {
      // Also the landing spot for a stray row outside a table: its text is
      // worth more than the markup it lost.
      out.push(blocksOf(node.children, depth + 1, true));
    } else if (tag === 'th' || tag === 'td') {
      out.push(escapeLineStart(inlineOf(node.children)));
    }
  }
  flushLoose();

  // Empty paragraphs are blank lines the user typed; the join adds one already.
  const blocks = out.map((block, i) => ({ block, tight: tight.has(i) }));
  return blocks
    .filter(({ block }, i) => block !== '' || (i > 0 && i < blocks.length - 1))
    .reduce(
      (acc, { block, tight: hug }, i) => (i === 0 ? block : `${acc}${hug ? '\n' : '\n\n'}${block}`),
      '',
    )
    .replace(/\n{3,}/g, '\n\n');
}

/** Note html → markdown text (no trailing newline). */
export function htmlToMarkdown(html: string): string {
  if (html.trim() === '') return '';
  return blocksOf(buildTree(tokenizeHtml(html)), 0).trim();
}
