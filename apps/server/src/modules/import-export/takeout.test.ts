import { describe, expect, it } from 'vitest';
import { parseTakeoutNote } from './takeout.js';

describe('parseTakeoutNote', () => {
  it('parses a text note with metadata', () => {
    const parsed = parseTakeoutNote({
      title: 'Groceries',
      textContent: 'milk\nbread',
      color: 'RED',
      isPinned: true,
      isArchived: false,
      isTrashed: false,
      labels: [{ name: 'Home' }, { name: 'Home' }, { name: '' }],
      userEditedTimestampUsec: 1721995200000000,
      createdTimestampUsec: 1721908800000000,
    });
    expect(parsed).toMatchObject({
      type: 'text',
      title: 'Groceries',
      bodyText: 'milk\nbread',
      color: 'coral',
      pinned: true,
      labels: ['Home'],
    });
    expect(parsed?.createdAt?.toISOString()).toBe('2024-07-25T12:00:00.000Z');
    expect(parsed?.fingerprint).toHaveLength(64);
  });

  it('parses a list note with checked state', () => {
    const parsed = parseTakeoutNote({
      title: 'Packing',
      listContent: [
        { text: 'passport', isChecked: true },
        { text: 'socks', isChecked: false },
      ],
      color: 'TEAL',
    });
    expect(parsed?.type).toBe('list');
    expect(parsed?.items).toEqual([
      { text: 'passport', checked: true },
      { text: 'socks', checked: false },
    ]);
    expect(parsed?.color).toBe('sage');
  });

  it('maps every Takeout color and defaults unknowns', () => {
    expect(parseTakeoutNote({ textContent: 'x', color: 'GRAY' })?.color).toBe('chalk');
    expect(parseTakeoutNote({ textContent: 'x', color: 'CERULEAN' })?.color).toBe('storm');
    expect(parseTakeoutNote({ textContent: 'x', color: 'HOTPINK' })?.color).toBe('default');
  });

  it('produces identical fingerprints for identical notes (idempotent re-import)', () => {
    const a = parseTakeoutNote({ title: 'Same', textContent: 'body', createdTimestampUsec: 5 });
    const b = parseTakeoutNote({ title: 'Same', textContent: 'body', createdTimestampUsec: 5 });
    const c = parseTakeoutNote({ title: 'Same', textContent: 'other', createdTimestampUsec: 5 });
    expect(a?.fingerprint).toBe(b?.fingerprint);
    expect(a?.fingerprint).not.toBe(c?.fingerprint);
  });

  it('rejects non-note payloads', () => {
    expect(parseTakeoutNote(null)).toBeNull();
    expect(parseTakeoutNote({ some: 'random json' })).toBeNull();
    expect(parseTakeoutNote('string')).toBeNull();
  });

  it('records attachment references', () => {
    const parsed = parseTakeoutNote({
      title: 'Pic',
      textContent: '',
      attachments: [{ filePath: 'photos/img1.png', mimetype: 'image/png' }],
    });
    expect(parsed?.attachmentPaths).toEqual([
      { filePath: 'photos/img1.png', mimetype: 'image/png' },
    ]);
  });
});
