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
