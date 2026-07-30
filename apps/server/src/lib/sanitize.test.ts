import { describe, expect, it } from 'vitest';
import { detectLinks, htmlToPlainText, plainTextToHtml, sanitizeNoteHtml } from './sanitize.js';

describe('sanitizeNoteHtml', () => {
  it('keeps the Keep formatting set', () => {
    const input = '<h1>A</h1><h2>B</h2><p><strong>b</strong> <em>i</em> <u>u</u><br>x</p>';
    expect(sanitizeNoteHtml(input)).toBe(input.replace('<br>', '<br />'));
  });

  it('keeps the markdown vocabulary on top of it', () => {
    const input =
      '<h3>C</h3><h6>F</h6><p><s>x</s> <code>y</code></p><blockquote><p>q</p></blockquote>' +
      '<ul><li>a</li></ul><ol start="3"><li>b</li></ol><pre><code class="language-js">z</code></pre>';
    expect(sanitizeNoteHtml(input)).toBe(input);
    expect(sanitizeNoteHtml('<hr>')).toBe('<hr />');
  });

  it('keeps safe links and hardens them', () => {
    expect(sanitizeNoteHtml('<p><a href="https://e.com/a">x</a></p>')).toBe(
      '<p><a href="https://e.com/a" target="_blank" rel="noopener noreferrer nofollow">x</a></p>',
    );
    expect(sanitizeNoteHtml('<p><a href="mailto:a@b.com">m</a></p>')).toContain('mailto:a@b.com');
  });

  it('drops link schemes outside http/https/mailto, keeping the text', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x']) {
      const out = sanitizeNoteHtml(`<p><a href="${href}">click</a></p>`);
      expect(out).toContain('click');
      expect(out).not.toContain('href');
    }
  });

  it('keeps only the language class on code', () => {
    expect(sanitizeNoteHtml('<pre><code class="language-ts evil">x</code></pre>')).toBe(
      '<pre><code class="language-ts">x</code></pre>',
    );
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

  it('strips presentation attributes, even on allowed tags', () => {
    expect(sanitizeNoteHtml('<p class="x" data-y="1" id="z">hi</p>')).toBe('<p>hi</p>');
    expect(sanitizeNoteHtml('<ul style="color:red"><li id="a">x</li></ul>')).toBe(
      '<ul><li>x</li></ul>',
    );
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
