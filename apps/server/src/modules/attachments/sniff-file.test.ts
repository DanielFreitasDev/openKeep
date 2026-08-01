import { describe, expect, it } from 'vitest';
import { looksLikeText, sniffFile } from './service.js';

const pad = (b: Buffer, len = 16) => Buffer.concat([b, Buffer.alloc(Math.max(0, len - b.length))]);

const PDF = pad(Buffer.from('%PDF-1.7\n%âãÏÓ\n'), 32);
/** A zip's local file header — what every OOXML/ODF document starts with. */
const ZIP = pad(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26)]));
const EMPTY_ZIP = pad(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
const OLE2 = pad(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
const TEXT = Buffer.from('shopping list\n- milk\n- açaí\n');

describe('sniffFile', () => {
  it.each([
    ['a pdf', PDF, 'invoice.pdf', 'application/pdf', 'pdf'],
    ['a zip', ZIP, 'photos.zip', 'application/zip', 'zip'],
    ['an empty zip', EMPTY_ZIP, 'photos.zip', 'application/zip', 'zip'],
    [
      'a docx (a zip named as one)',
      ZIP,
      'contract.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx',
    ],
    ['an odt', ZIP, 'notes.odt', 'application/vnd.oasis.opendocument.text', 'odt'],
    ['an epub', ZIP, 'book.epub', 'application/epub+zip', 'epub'],
    ['a legacy doc (OLE2)', OLE2, 'letter.doc', 'application/msword', 'doc'],
    ['a legacy xls (OLE2)', OLE2, 'budget.xls', 'application/vnd.ms-excel', 'xls'],
    ['plain text', TEXT, 'list.txt', 'text/plain', 'txt'],
    ['markdown', TEXT, 'README.md', 'text/markdown', 'md'],
    ['csv', Buffer.from('a,b\n1,2\n'), 'rows.csv', 'text/csv', 'csv'],
    ['an uppercase extension', PDF, 'INVOICE.PDF', 'application/pdf', 'pdf'],
  ])('accepts %s', (_name, buffer, filename, mime, ext) => {
    expect(sniffFile(buffer, filename)).toEqual({ mime, ext });
  });

  it.each([
    // The extension names the format, so one we do not carry is refused
    // whatever the bytes are — no executables, no html on our own origin.
    ['an unknown extension', PDF, 'invoice.pdf.exe'],
    ['no extension at all', PDF, 'invoice'],
    ['html', Buffer.from('<h1>hi</h1>'), 'page.html'],
    ['an image (it has its own route)', pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'photo.jpg'],
    // And the bytes prove the container, so the name cannot lie about it.
    ['a pdf renamed .docx', PDF, 'contract.docx'],
    ['a zip renamed .pdf', ZIP, 'invoice.pdf'],
    ['text renamed .pdf', TEXT, 'invoice.pdf'],
    ['a binary renamed .txt', OLE2, 'list.txt'],
    ['an empty pdf', Buffer.alloc(0), 'invoice.pdf'],
  ])('refuses %s', (_name, buffer, filename) => {
    expect(sniffFile(buffer, filename)).toBeNull();
  });
});

describe('looksLikeText', () => {
  it('accepts UTF-8 with tabs and newlines', () => {
    expect(looksLikeText(Buffer.from('a\tb\r\nção 🎉\n'))).toBe(true);
  });

  it('accepts an empty file', () => {
    expect(looksLikeText(Buffer.alloc(0))).toBe(true);
  });

  it('rejects NUL bytes and other control characters', () => {
    expect(looksLikeText(Buffer.from('a\0b'))).toBe(false);
    expect(looksLikeText(Buffer.from([0x61, 0x07]))).toBe(false);
  });

  it('rejects bytes that are not UTF-8 (a Latin-1 file)', () => {
    expect(looksLikeText(Buffer.from([0x61, 0xe7, 0x61, 0x69]))).toBe(false);
  });
});
