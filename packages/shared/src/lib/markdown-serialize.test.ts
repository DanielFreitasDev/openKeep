import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.js';
import { htmlToMarkdown } from './markdown-serialize.js';

describe('htmlToMarkdown', () => {
  it('serializes headings, paragraphs and breaks', () => {
    expect(htmlToMarkdown('<h1>T</h1><p>a<br>b</p><p>c</p>')).toBe('# T\n\na  \nb\n\nc');
    expect(htmlToMarkdown('<h4>Deep</h4>')).toBe('#### Deep');
  });

  it('serializes inline marks', () => {
    expect(htmlToMarkdown('<p><strong>b</strong> <em>i</em> <s>s</s> <u>u</u></p>')).toBe(
      '**b** *i* ~~s~~ <u>u</u>',
    );
    expect(htmlToMarkdown('<p><code>a &lt; b</code></p>')).toBe('`a < b`');
    expect(htmlToMarkdown('<p><code>back ` tick</code></p>')).toBe('``back ` tick``');
  });

  it('serializes links, collapsing bare ones to autolinks', () => {
    expect(htmlToMarkdown('<p><a href="https://e.com">docs</a></p>')).toBe('[docs](https://e.com)');
    expect(htmlToMarkdown('<p><a href="https://e.com">https://e.com</a></p>')).toBe(
      '<https://e.com>',
    );
  });

  it('serializes code blocks with their language', () => {
    expect(htmlToMarkdown('<pre><code class="language-ts">a &amp;&amp; b</code></pre>')).toBe(
      '```ts\na && b\n```',
    );
  });

  it('serializes quotes, rules and lists', () => {
    expect(htmlToMarkdown('<blockquote><p>q</p></blockquote>')).toBe('> q');
    expect(htmlToMarkdown('<hr>')).toBe('---');
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b');
    expect(htmlToMarkdown('<ol start="3"><li>a</li><li>b</li></ol>')).toBe('3. a\n4. b');
    expect(htmlToMarkdown('<ul><li>a<ul><li>b</li></ul></li></ul>')).toBe('- a\n  - b');
  });

  it('unwraps the paragraph TipTap puts inside list items', () => {
    expect(htmlToMarkdown('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b');
  });

  it('escapes text that would otherwise read as markup', () => {
    expect(htmlToMarkdown('<p>2 * 3</p>')).toBe('2 \\* 3');
    expect(htmlToMarkdown('<p>- not a bullet</p>')).toBe('\\- not a bullet');
    expect(htmlToMarkdown('<p># not a heading</p>')).toBe('\\# not a heading');
    expect(htmlToMarkdown('<p>snake_case_name</p>')).toBe('snake_case_name');
    expect(htmlToMarkdown('<p>[x](y)</p>')).toBe('\\[x](y)');
  });

  it('serializes a table, seeing through thead/tbody and cell paragraphs', () => {
    expect(
      htmlToMarkdown(
        '<table><thead><tr><th>a</th><th>b</th></tr></thead>' +
          '<tbody><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>',
      ),
    ).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |');
  });

  it('keeps a table row on one line and escapes pipes in cells', () => {
    expect(htmlToMarkdown('<table><tr><th>a</th></tr><tr><td>x<br>y</td></tr></table>')).toBe(
      '| a |\n| --- |\n| x y |',
    );
    expect(htmlToMarkdown('<table><tr><th>a</th></tr><tr><td>x | y</td></tr></table>')).toBe(
      '| a |\n| --- |\n| x \\| y |',
    );
  });

  it('squares up a ragged table so the columns still line up', () => {
    expect(htmlToMarkdown('<table><tr><th>a</th><th>b</th></tr><tr><td>1</td></tr></table>')).toBe(
      '| a | b |\n| --- | --- |\n| 1 |  |',
    );
  });

  it('is empty for empty html', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('<p></p>')).toBe('');
  });
});

describe('round trip', () => {
  const cases = [
    '# Title',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    'plain paragraph',
    'a  \nb',
    '**bold** and *italic* and <u>under</u> and ~~gone~~',
    'inline `code` here',
    '```js\nconst a = 1;\n```',
    '> quoted line',
    '- a\n- b',
    '1. a\n2. b',
    '- a\n  - b',
    '---',
    '[docs](https://example.com/a)',
    '# Title\n\nbody paragraph\n\n- one\n- two',
    '2 \\* 3 is not emphasis',
    'snake_case_name',
  ];

  for (const markdown of cases) {
    it(`survives ${JSON.stringify(markdown)}`, () => {
      expect(htmlToMarkdown(renderMarkdown(markdown))).toBe(markdown);
    });
  }

  it('is stable on a second pass for text that normalizes', () => {
    const once = htmlToMarkdown(renderMarkdown('* a\n+ b'));
    expect(once).toBe('- a\n- b');
    expect(htmlToMarkdown(renderMarkdown(once))).toBe(once);
  });
});
