import { describe, expect, it } from 'vitest';
import { detectLinks, htmlToPlainText, plainTextToHtml, sanitizeNoteHtml } from './sanitize.js';

describe('sanitizeNoteHtml', () => {
  it('keeps exactly the Keep formatting set', () => {
    const input = '<h1>A</h1><h2>B</h2><p><strong>b</strong> <em>i</em> <u>u</u><br>x</p>';
    expect(sanitizeNoteHtml(input)).toBe(input.replace('<br>', '<br />'));
  });

  const XSS_CORPUS: [string, string[]][] = [
    ['<script>alert(1)</script><p>hi</p>', ['script', 'alert']],
    ['<p onclick="alert(1)">hi</p>', ['onclick']],
    ['<img src=x onerror=alert(1)><p>hi</p>', ['img', 'onerror']],
    ['<a href="javascript:alert(1)">hi</a>', ['href', 'javascript', '<a']],
    ['<p style="background:url(javascript:x)">hi</p>', ['style']],
    ['<iframe src="https://evil.example"></iframe><p>hi</p>', ['iframe']],
    ['<svg><animate onbegin=alert(1) /></svg><p>hi</p>', ['svg', 'animate']],
    ['<math><mi xlink:href="data:x">m</mi></math><p>hi</p>', ['math', 'xlink']],
    ['<form action=x><input value=y></form><p>hi</p>', ['form', 'input']],
    ['<details open ontoggle=alert(1)><p>hi</p></details>', ['details', 'ontoggle']],
  ];

  it.each(XSS_CORPUS)('neutralizes %s', (input, forbidden) => {
    const out = sanitizeNoteHtml(input).toLowerCase();
    for (const marker of forbidden) {
      expect(out).not.toContain(marker.toLowerCase());
    }
    expect(out).toContain('hi');
  });

  it('normalizes legacy b/i to strong/em', () => {
    expect(sanitizeNoteHtml('<p><b>x</b><i>y</i></p>')).toBe('<p><strong>x</strong><em>y</em></p>');
  });

  it('strips all attributes, even on allowed tags', () => {
    expect(sanitizeNoteHtml('<p class="x" data-y="1" id="z">hi</p>')).toBe('<p>hi</p>');
  });
});

describe('plainTextToHtml ∘ sanitizeNoteHtml', () => {
  // Conversion internals are covered in @openkeep/shared/lib/text.test.ts;
  // here we pin that shared output survives the server sanitizer unchanged.
  it('round-trips through the sanitizer unchanged', () => {
    const html = plainTextToHtml('x < y\nz & w');
    expect(sanitizeNoteHtml(html)).toBe(html);
  });

  it('html→text→html preserves visible content', () => {
    const text = htmlToPlainText('<h1>Title</h1><p>a<br>b</p>');
    expect(text).toBe('Title\na\nb');
  });
});

describe('detectLinks', () => {
  it('detects http(s) URLs', () => {
    expect(detectLinks('see https://example.com/x')).toBe(true);
    expect(detectLinks('see http://example.com')).toBe(true);
    expect(detectLinks('no links here, just example.com text')).toBe(false);
  });
});
