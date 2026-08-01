import { describe, expect, it } from 'vitest';
import {
  FILE_ACCEPT,
  FILE_TYPES,
  fileExtensionOf,
  fileTypeOf,
  sanitizeAttachmentFilename,
} from './attachment-files.js';

describe('the allowlist', () => {
  it('has one entry per extension and offers them all to the picker', () => {
    const exts = FILE_TYPES.map((t) => t.ext);
    expect(new Set(exts).size).toBe(exts.length);
    expect(FILE_ACCEPT.split(',')).toEqual(exts.map((e) => `.${e}`));
  });

  it('never carries an extension an image or audio route already owns', () => {
    const media = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp3', 'm4a', 'ogg', 'webm', 'wav'];
    expect(FILE_TYPES.filter((t) => media.includes(t.ext))).toEqual([]);
  });
});

describe('fileExtensionOf', () => {
  it.each([
    ['invoice.pdf', 'pdf'],
    ['INVOICE.PDF', 'pdf'],
    ['archive.tar.gz', 'gz'],
    ['no-extension', ''],
    // A dotfile is a name, not an extension.
    ['.gitignore', ''],
  ])('%s → %s', (name, ext) => {
    expect(fileExtensionOf(name)).toBe(ext);
  });
});

describe('fileTypeOf', () => {
  it('maps a known extension to its mime', () => {
    expect(fileTypeOf('sheet.xlsx')?.mime).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('is null for anything the table omits', () => {
    expect(fileTypeOf('run.exe')).toBeNull();
    expect(fileTypeOf('page.html')).toBeNull();
    expect(fileTypeOf('photo.png')).toBeNull();
  });
});

describe('sanitizeAttachmentFilename', () => {
  it('keeps an ordinary name, accents included', () => {
    expect(sanitizeAttachmentFilename('Orçamento final.pdf')).toBe('Orçamento final.pdf');
  });

  it('keeps only the last path segment', () => {
    expect(sanitizeAttachmentFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAttachmentFilename('C:\\Users\\me\\note.txt')).toBe('note.txt');
  });

  it('strips control characters and never returns nothing', () => {
    expect(sanitizeAttachmentFilename('a\u0000b\u001f.pdf')).toBe('ab.pdf');
    expect(sanitizeAttachmentFilename('   ')).toBe('file');
    expect(sanitizeAttachmentFilename('/')).toBe('file');
  });

  it('truncates the stem but keeps the extension', () => {
    const long = sanitizeAttachmentFilename(`${'a'.repeat(300)}.pdf`, 20);
    expect(long).toHaveLength(20);
    expect(long.endsWith('.pdf')).toBe(true);
  });
});
