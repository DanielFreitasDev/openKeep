import { describe, expect, it } from 'vitest';
import { htmlToPlainText, plainTextToHtml } from './text.js';

describe('htmlToPlainText', () => {
  it('converts block boundaries and breaks to newlines', () => {
    expect(htmlToPlainText('<h1>Title</h1><p>a<br>b</p><p>c</p>')).toBe('Title\na\nb\nc');
  });

  it('decodes entities', () => {
    expect(htmlToPlainText('<p>a &amp; b &lt;c&gt; &quot;d&quot;</p>')).toBe('a & b <c> "d"');
  });

  it('collapses excessive blank lines', () => {
    expect(htmlToPlainText('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });

  it('keeps list structure — bullets and numbers carry meaning when flattened', () => {
    expect(htmlToPlainText('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b');
    expect(htmlToPlainText('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b');
    expect(htmlToPlainText('<ol start="3"><li>a</li></ol>')).toBe('3. a');
    expect(htmlToPlainText('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b');
    expect(htmlToPlainText('<ul><li>a<ul><li>b</li></ul></li></ul>')).toBe('- a\n  - b');
  });

  it('flattens the decoration-only blocks', () => {
    expect(htmlToPlainText('<h3>T</h3><blockquote><p>q</p></blockquote><hr><p>after</p>')).toBe(
      'T\nq\n\nafter',
    );
    expect(htmlToPlainText('<p>see <a href="https://e.com">docs</a></p>')).toBe('see docs');
  });

  it('keeps a table readable: one line per row, columns separated', () => {
    expect(
      htmlToPlainText(
        '<p>before</p><table><tbody><tr><th>a</th><th>b</th></tr>' +
          '<tr><td><p>1</p></td><td><p>x<br>y</p></td></tr></tbody></table><p>after</p>',
      ),
    ).toBe('before\na | b\n1 | x y\n\nafter');
  });

  it('keeps code verbatim', () => {
    expect(htmlToPlainText('<pre><code class="language-js">a &lt; b\n  c</code></pre>')).toBe(
      'a < b\n  c',
    );
    expect(htmlToPlainText('<p>run <code>npm i</code></p>')).toBe('run npm i');
  });
});

describe('plainTextToHtml', () => {
  it('escapes and wraps lines in paragraphs', () => {
    expect(plainTextToHtml('a<b>\nc & d')).toBe('<p>a&lt;b&gt;</p><p>c &amp; d</p>');
  });

  it('round-trips with htmlToPlainText', () => {
    const text = 'x < y\nz & w';
    expect(htmlToPlainText(plainTextToHtml(text))).toBe(text);
  });
});
