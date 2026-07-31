// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrintSheet, PRINT_ROOT_ID, type PrintNoteData, printNote } from './print-note.js';

const data = (over: Partial<PrintNoteData> = {}): PrintNoteData => ({
  title: 'Beach trip',
  bodyHtml: '',
  items: [],
  imageUrls: [],
  meta: [],
  documentTitle: 'Beach trip',
  ...over,
});

/** happy-dom has no window.print, so it is installed rather than spied on. */
function stubPrint(impl: () => void = () => undefined) {
  const fn = vi.fn(impl);
  Object.defineProperty(window, 'print', { value: fn, configurable: true, writable: true });
  return fn;
}

afterEach(() => {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  vi.restoreAllMocks();
});

describe('buildPrintSheet', () => {
  it('prints the title, the rich body and the footer', () => {
    const sheet = buildPrintSheet(
      data({
        bodyHtml: '<h2>Packing</h2><p>towel &amp; <strong>sunscreen</strong></p>',
        meta: ['Travel', 'Edited Jul 30'],
      }),
    );

    expect(sheet.querySelector('.print-title')?.textContent).toBe('Beach trip');
    expect(sheet.querySelector('.print-body strong')?.textContent).toBe('sunscreen');
    // The card and the editor style the same class, so the paper reads alike.
    expect(sheet.querySelector('.print-body')?.classList.contains('note-body')).toBe(true);
    expect(sheet.querySelector('.print-meta')?.textContent).toBe('Travel · Edited Jul 30');
  });

  it('leaves out what the note does not have', () => {
    const sheet = buildPrintSheet(data({ title: '', bodyHtml: '' }));

    expect(sheet.querySelector('.print-title')).toBeNull();
    expect(sheet.querySelector('.print-body')).toBeNull();
    expect(sheet.querySelector('.print-meta')).toBeNull();
  });

  it('renders checklist rows in the given order, with text glyphs for the boxes', () => {
    const sheet = buildPrintSheet(
      data({
        items: [
          { text: 'sunscreen', checked: false, indent: 0 },
          { text: 'factor 50', checked: false, indent: 1 },
          { text: 'towel', checked: true, indent: 0 },
        ],
      }),
    );

    const rows = [...sheet.querySelectorAll('.print-item')];
    expect(rows.map((r) => r.querySelector('.print-text')?.textContent)).toEqual([
      'sunscreen',
      'factor 50',
      'towel',
    ]);
    expect(rows.map((r) => r.querySelector('.print-box')?.textContent)).toEqual(['☐', '☐', '☑']);
    expect(rows[1]?.classList.contains('print-item-indent')).toBe(true);
    expect(rows[2]?.classList.contains('print-item-checked')).toBe(true);
  });

  it('never mixes a checklist with the body html', () => {
    const sheet = buildPrintSheet(
      data({ items: [{ text: 'towel', checked: false, indent: 0 }], bodyHtml: '<p>leftover</p>' }),
    );

    expect(sheet.querySelector('.print-body')).toBeNull();
    expect(sheet.querySelectorAll('.print-item')).toHaveLength(1);
  });

  it('escapes item text — only the body html is trusted', () => {
    const sheet = buildPrintSheet(
      data({ items: [{ text: '<img src=x onerror=alert(1)>', checked: false, indent: 0 }] }),
    );

    expect(sheet.querySelector('.print-item img')).toBeNull();
    expect(sheet.querySelector('.print-text')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('printNote', () => {
  it('mounts the sheet, renames the document and prints', async () => {
    const print = stubPrint();
    document.title = 'OpenKeep';

    await printNote(data({ documentTitle: 'Beach trip' }));

    expect(print).toHaveBeenCalledTimes(1);
    // Browsers name the PDF after document.title.
    expect(document.title).toBe('Beach trip');
    expect(document.getElementById(PRINT_ROOT_ID)?.textContent).toContain('Beach trip');
  });

  it('tears the sheet down and gives the title back on afterprint', async () => {
    stubPrint();
    document.title = 'OpenKeep';

    await printNote(data());
    window.dispatchEvent(new Event('afterprint'));

    expect(document.getElementById(PRINT_ROOT_ID)).toBeNull();
    expect(document.title).toBe('OpenKeep');
  });

  it('keeps a single sheet when printing twice before afterprint', async () => {
    stubPrint();
    document.title = 'OpenKeep';

    await printNote(data({ title: 'First', documentTitle: 'First' }));
    await printNote(data({ title: 'Second', documentTitle: 'Second' }));
    window.dispatchEvent(new Event('afterprint'));

    expect(document.getElementById(PRINT_ROOT_ID)).toBeNull();
    // The app's own title comes back — not the first note's, which is what a
    // stale restore listener from the first print would have left behind.
    expect(document.title).toBe('OpenKeep');
  });

  it('cleans up when the browser refuses to print', async () => {
    stubPrint(() => {
      throw new Error('print blocked');
    });
    document.title = 'OpenKeep';

    await printNote(data());

    expect(document.getElementById(PRINT_ROOT_ID)).toBeNull();
    expect(document.title).toBe('OpenKeep');
  });
});
