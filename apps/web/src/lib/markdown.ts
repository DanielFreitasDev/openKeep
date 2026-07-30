/**
 * Markdown → the note html allowlist (`h1 h2 p br strong em`), for pasting.
 *
 * Deliberately hand-rolled instead of a real parser: the note vocabulary is
 * Keep's May-2025 set, so anything a full parser produced (lists, code, links,
 * tables) would be discarded by the server sanitizer anyway — and quietly
 * losing pasted content is worse than pasting it as plain text. Constructs
 * outside the vocabulary therefore survive verbatim, as the characters the
 * user actually pasted.
 */

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** `#`…`######` + space. Levels beyond 2 clamp to H2 — the vocabulary stops there. */
const HEADING_RE = /^(#{1,6})[ \t]+(\S.*)$/;

/**
 * Inline marks, widest delimiter first so `**x**` is not eaten by the italic
 * rule. The lookarounds are what keep prose intact: no match when the
 * delimiter hugs whitespace (`2 * 3 * 4`) or sits inside a word
 * (`snake_case_name`).
 */
const INLINE: { re: RegExp; tag: 'strong' | 'em' }[] = [
  { re: /(?<!\*)\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*(?!\*)/g, tag: 'strong' },
  { re: /(?<![\w_])__(?!\s)([^_\n]+?)(?<!\s)__(?![\w_])/g, tag: 'strong' },
  { re: /(?<![\w*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\w*])/g, tag: 'em' },
  { re: /(?<![\w_])_(?!\s)([^_\n]+?)(?<!\s)_(?![\w_])/g, tag: 'em' },
];

/** Applies the inline rules to already-escaped text; reports whether any fired. */
function inline(escaped: string): { html: string; matched: boolean } {
  let html = escaped;
  let matched = false;
  for (const { re, tag } of INLINE) {
    html = html.replace(re, (_full, inner: string) => {
      matched = true;
      return `<${tag}>${inner}</${tag}>`;
    });
  }
  return { html, matched };
}

/**
 * Converts pasted markdown to note html, or returns `null` when the text
 * carries no markdown at all — the caller then leaves the paste to the
 * editor's normal plain-text path instead of round-tripping it through here.
 *
 * Blank lines separate paragraphs; a single newline is a `<br>`, matching what
 * Shift+Enter produces in the editor.
 */
export function markdownToHtml(text: string): string | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let matched = false;

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.join('<br>')}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading?.[1] && heading[2]) {
      flush();
      matched = true;
      const level = heading[1].length === 1 ? 1 : 2;
      blocks.push(`<h${level}>${inline(escapeHtml(heading[2])).html}</h${level}>`);
      continue;
    }
    const { html, matched: hit } = inline(escapeHtml(line));
    matched ||= hit;
    paragraph.push(html);
  }
  flush();

  return matched ? blocks.join('') : null;
}
