import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './markdown.js';

describe('markdownToHtml', () => {
  it('returns null when the text carries no markdown', () => {
    expect(markdownToHtml('just a note')).toBeNull();
    expect(markdownToHtml('line one\nline two\n\nline three')).toBeNull();
  });

  it('maps headings to the note vocabulary, clamping past H2', () => {
    expect(markdownToHtml('# Title')).toBe('<h1>Title</h1>');
    expect(markdownToHtml('## Sub')).toBe('<h2>Sub</h2>');
    expect(markdownToHtml('##### Deep')).toBe('<h2>Deep</h2>');
  });

  it('needs whitespace after the hashes', () => {
    expect(markdownToHtml('#tag')).toBeNull();
  });

  it('converts bold and italic in both delimiters', () => {
    expect(markdownToHtml('a **b** c')).toBe('<p>a <strong>b</strong> c</p>');
    expect(markdownToHtml('a __b__ c')).toBe('<p>a <strong>b</strong> c</p>');
    expect(markdownToHtml('a *b* c')).toBe('<p>a <em>b</em> c</p>');
    expect(markdownToHtml('a _b_ c')).toBe('<p>a <em>b</em> c</p>');
  });

  it('leaves prose that merely contains the delimiters alone', () => {
    expect(markdownToHtml('2 * 3 * 4')).toBeNull();
    expect(markdownToHtml('call snake_case_name here')).toBeNull();
    expect(markdownToHtml('a * b')).toBeNull();
  });

  it('splits paragraphs on blank lines and keeps single newlines as breaks', () => {
    expect(markdownToHtml('# T\none\ntwo\n\nthree **b**')).toBe(
      '<h1>T</h1><p>one<br>two</p><p>three <strong>b</strong></p>',
    );
  });

  it('escapes html before applying the marks', () => {
    expect(markdownToHtml('# <script>alert(1)</script>')).toBe(
      '<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>',
    );
    expect(markdownToHtml('**a & b**')).toBe('<p><strong>a &amp; b</strong></p>');
  });

  it('normalizes CRLF', () => {
    expect(markdownToHtml('# T\r\n\r\nbody')).toBe('<h1>T</h1><p>body</p>');
  });
});
