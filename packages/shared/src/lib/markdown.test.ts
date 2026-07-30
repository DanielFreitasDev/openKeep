import { describe, expect, it } from 'vitest';
import { markdownToHtml, renderMarkdown } from './markdown.js';

describe('markdownToHtml — detection', () => {
  it('returns null when the text carries no markdown', () => {
    expect(markdownToHtml('just a note')).toBeNull();
    expect(markdownToHtml('line one\nline two\n\nline three')).toBeNull();
  });

  it('leaves prose that merely contains the delimiters alone', () => {
    expect(markdownToHtml('2 * 3 * 4')).toBeNull();
    expect(markdownToHtml('call snake_case_name here')).toBeNull();
    expect(markdownToHtml('a * b')).toBeNull();
    expect(markdownToHtml('5 - 3 = 2')).toBeNull();
    expect(markdownToHtml('#tag')).toBeNull();
  });

  it('still converts once anything markdown appears', () => {
    expect(markdownToHtml('# T\none\ntwo\n\nthree **b**')).toBe(
      '<h1>T</h1><p>one<br>two</p><p>three <strong>b</strong></p>',
    );
  });
});

describe('headings', () => {
  it('maps all six levels', () => {
    expect(renderMarkdown('# One')).toBe('<h1>One</h1>');
    expect(renderMarkdown('## Two')).toBe('<h2>Two</h2>');
    expect(renderMarkdown('###### Six')).toBe('<h6>Six</h6>');
  });

  it('needs whitespace after the hashes and drops closing hashes', () => {
    expect(renderMarkdown('#tag')).toBe('<p>#tag</p>');
    expect(renderMarkdown('## Two ##')).toBe('<h2>Two</h2>');
  });
});

describe('inline marks', () => {
  it('converts bold and italic in both delimiters', () => {
    expect(renderMarkdown('a **b** c')).toBe('<p>a <strong>b</strong> c</p>');
    expect(renderMarkdown('a __b__ c')).toBe('<p>a <strong>b</strong> c</p>');
    expect(renderMarkdown('a *b* c')).toBe('<p>a <em>b</em> c</p>');
    expect(renderMarkdown('a _b_ c')).toBe('<p>a <em>b</em> c</p>');
  });

  it('nests emphasis instead of closing at the first delimiter', () => {
    expect(renderMarkdown('*a **b** c*')).toBe('<p><em>a <strong>b</strong> c</em></p>');
    expect(renderMarkdown('***all***')).toBe('<p><em><strong>all</strong></em></p>');
  });

  it('handles strikethrough, code spans and underline', () => {
    expect(renderMarkdown('~~gone~~')).toBe('<p><s>gone</s></p>');
    expect(renderMarkdown('use `npm i` now')).toBe('<p>use <code>npm i</code> now</p>');
    expect(renderMarkdown('`` a ` b ``')).toBe('<p><code>a ` b</code></p>');
    expect(renderMarkdown('<u>under</u>')).toBe('<p><u>under</u></p>');
  });

  it('keeps markdown inside code spans literal', () => {
    expect(renderMarkdown('`**not bold**`')).toBe('<p><code>**not bold**</code></p>');
  });

  it('honours backslash escapes', () => {
    expect(renderMarkdown('\\*literal\\*')).toBe('<p>*literal*</p>');
  });

  it('escapes html before applying the marks', () => {
    expect(renderMarkdown('# <script>alert(1)</script>')).toBe(
      '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>',
    );
    expect(renderMarkdown('**a & b**')).toBe('<p><strong>a &amp; b</strong></p>');
  });
});

describe('links', () => {
  it('converts named links and autolinks', () => {
    expect(renderMarkdown('[docs](https://example.com/a)')).toBe(
      '<p><a href="https://example.com/a">docs</a></p>',
    );
    expect(renderMarkdown('<https://example.com>')).toBe(
      '<p><a href="https://example.com">https://example.com</a></p>',
    );
    expect(renderMarkdown('[mail](mailto:a@b.com)')).toBe(
      '<p><a href="mailto:a@b.com">mail</a></p>',
    );
  });

  it('drops the title and keeps inline marks in the label', () => {
    expect(renderMarkdown('[**b**](https://e.com "t")')).toBe(
      '<p><a href="https://e.com"><strong>b</strong></a></p>',
    );
  });

  it('refuses unsafe schemes, leaving the text as typed', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).toBe('<p>[x](javascript:alert(1))</p>');
    expect(renderMarkdown('[x](/relative/path)')).toBe('<p>[x](/relative/path)</p>');
  });

  it('degrades images to their link', () => {
    expect(renderMarkdown('![alt](https://e.com/i.png)')).toBe(
      '<p><a href="https://e.com/i.png">alt</a></p>',
    );
  });
});

describe('blocks', () => {
  it('parses fenced code with a language', () => {
    expect(renderMarkdown('```js\nconst a = 1 < 2;\n```')).toBe(
      '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>',
    );
    expect(renderMarkdown('```\nplain\n```')).toBe('<pre><code>plain</code></pre>');
  });

  it('leaves an unterminated fence as a code block to the end', () => {
    expect(renderMarkdown('```\nstill code')).toBe('<pre><code>still code</code></pre>');
  });

  it('parses rules and quotes', () => {
    expect(renderMarkdown('---')).toBe('<hr>');
    expect(renderMarkdown('***')).toBe('<hr>');
    expect(renderMarkdown('> quoted\n> more')).toBe(
      '<blockquote><p>quoted<br>more</p></blockquote>',
    );
    expect(renderMarkdown('> outer\n>> inner')).toBe(
      '<blockquote><p>outer</p><blockquote><p>inner</p></blockquote></blockquote>',
    );
  });

  it('parses bullet and ordered lists', () => {
    expect(renderMarkdown('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderMarkdown('* a\n+ b')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(renderMarkdown('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>');
    expect(renderMarkdown('3. a\n4. b')).toBe('<ol start="3"><li>a</li><li>b</li></ol>');
  });

  it('nests lists by indentation', () => {
    expect(renderMarkdown('- a\n  - b\n- c')).toBe(
      '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>',
    );
  });

  it('keeps inline marks inside list items', () => {
    expect(renderMarkdown('- **a** and `b`')).toBe(
      '<ul><li><strong>a</strong> and <code>b</code></li></ul>',
    );
  });

  it('keeps task-list boxes as text (the checklist lives on the note itself)', () => {
    expect(renderMarkdown('- [ ] todo')).toBe('<ul><li>[ ] todo</li></ul>');
  });

  it('lets a list interrupt a paragraph but not a stray number', () => {
    expect(renderMarkdown('intro\n- a')).toBe('<p>intro</p><ul><li>a</li></ul>');
    expect(renderMarkdown('the year\n2024. was good')).toBe('<p>the year<br>2024. was good</p>');
  });

  it('separates paragraphs on blank lines and keeps single newlines as breaks', () => {
    expect(renderMarkdown('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
  });

  it('treats two trailing spaces as the break they already are', () => {
    expect(renderMarkdown('a  \nb')).toBe('<p>a<br>b</p>');
  });

  it('normalizes CRLF', () => {
    expect(renderMarkdown('# T\r\n\r\nbody')).toBe('<h1>T</h1><p>body</p>');
  });
});

describe('robustness', () => {
  it('survives deeply nested and unbalanced delimiters', () => {
    expect(() => renderMarkdown('*'.repeat(200))).not.toThrow();
    expect(() => renderMarkdown(`${'> '.repeat(80)}deep`)).not.toThrow();
    expect(() => renderMarkdown(`${'- '.repeat(60)}deep`)).not.toThrow();
    expect(renderMarkdown('**unclosed')).toBe('<p>**unclosed</p>');
  });

  it('never emits a tag outside the note vocabulary', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>\n\n<div onclick="x">hi</div>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<div');
    // The attributes survive as visible text, which is the point: nothing is
    // silently dropped, and nothing is a tag any more.
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
