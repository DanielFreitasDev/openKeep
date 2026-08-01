import type { FullNote } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import {
  mergeNote,
  removeNote,
  selectArchived,
  selectBacklinks,
  selectBulkLabels,
  selectHasTemplates,
  selectLinkTargets,
  selectMain,
  selectTemplates,
  selectTrashed,
  upsertNote,
} from './note-selectors.js';

let seq = 0;
function note(over: Partial<FullNote>): FullNote {
  seq += 1;
  return {
    id: `01890000-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    type: 'text',
    title: '',
    bodyHtml: '',
    hasLinks: false,
    items: [],
    labelIds: [],
    attachments: [],
    reminder: null,
    collaborators: [],
    role: 'owner',
    pinned: false,
    archived: false,
    isTemplate: false,
    color: 'default',
    background: 'none',
    position: `a${seq}`,
    trashedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('note selectors', () => {
  it('splits main view into pinned/others, excluding archived and trashed', () => {
    const notes = [
      note({ title: 'a', pinned: true }),
      note({ title: 'b' }),
      note({ title: 'c', archived: true }),
      note({ title: 'd', trashedAt: '2026-07-20T00:00:00.000Z' }),
    ];
    const { pinned, others } = selectMain(notes);
    expect(pinned.map((n) => n.title)).toEqual(['a']);
    expect(others.map((n) => n.title)).toEqual(['b']);
  });

  it('sorts by fractional position with id tiebreak', () => {
    const notes = [
      note({ title: 'later', position: 'a5' }),
      note({ title: 'first', position: 'a1' }),
      note({ title: 'mid', position: 'a3' }),
    ];
    expect(selectMain(notes).others.map((n) => n.title)).toEqual(['first', 'mid', 'later']);
  });

  it('selects archive flat and trash by recency', () => {
    const notes = [
      note({ title: 'arch', archived: true }),
      note({ title: 'old-trash', trashedAt: '2026-07-01T00:00:00.000Z' }),
      note({ title: 'new-trash', trashedAt: '2026-07-25T00:00:00.000Z' }),
    ];
    expect(selectArchived(notes).map((n) => n.title)).toEqual(['arch']);
    expect(selectTrashed(notes).map((n) => n.title)).toEqual(['new-trash', 'old-trash']);
  });

  it('orders by edit and creation date, newest first', () => {
    const notes = [
      note({
        title: 'stale',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      }),
      note({
        title: 'newborn',
        createdAt: '2026-07-30T00:00:00.000Z',
        updatedAt: '2026-07-30T00:00:00.000Z',
      }),
      note({
        title: 'revived',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z',
      }),
    ];
    expect(selectMain(notes, 'edited').others.map((n) => n.title)).toEqual([
      'revived',
      'newborn',
      'stale',
    ]);
    expect(selectMain(notes, 'created').others.map((n) => n.title)).toEqual([
      'newborn',
      'stale',
      'revived',
    ]);
  });

  it('orders by title, ignoring case and accents, with untitled notes last', () => {
    const notes = [
      note({ title: 'zebra' }),
      note({ title: '' }),
      // Code-point order would drop 'Á' (U+00C1) past every lowercase letter.
      note({ title: 'Ábaco' }),
      note({ title: 'apple' }),
    ];
    expect(selectMain(notes, 'title').others.map((n) => n.title)).toEqual([
      'Ábaco',
      'apple',
      'zebra',
      '',
    ]);
  });

  it('keeps ties and the default in manual order', () => {
    const notes = [
      note({ title: 'second', position: 'a5' }),
      note({ title: 'first', position: 'a1' }),
    ];
    // Same timestamps on both: the fractional position breaks the tie.
    expect(selectMain(notes, 'edited').others.map((n) => n.title)).toEqual(['first', 'second']);
    expect(selectMain(notes).others.map((n) => n.title)).toEqual(['first', 'second']);
  });

  it('sorts the archive by preference too', () => {
    const notes = [
      note({ title: 'b', archived: true, position: 'a1' }),
      note({ title: 'a', archived: true, position: 'a9' }),
    ];
    expect(selectArchived(notes, 'title').map((n) => n.title)).toEqual(['a', 'b']);
    expect(selectArchived(notes).map((n) => n.title)).toEqual(['b', 'a']);
  });

  it('cache ops: upsert, merge, remove are immutable', () => {
    const a = note({ title: 'a' });
    const list = [a];
    const b = note({ title: 'b' });
    const withB = upsertNote(list, b);
    expect(withB).toHaveLength(2);
    expect(list).toHaveLength(1);

    const merged = mergeNote(withB, a.id, { title: 'a2' });
    expect(merged.find((n) => n.id === a.id)?.title).toBe('a2');
    expect(withB.find((n) => n.id === a.id)?.title).toBe('a');

    expect(removeNote(merged, a.id)).toHaveLength(1);
  });

  it('splits bulk label state into fully applied and mixed', () => {
    const notes = [
      note({ labelIds: ['work', 'home'] }),
      note({ labelIds: ['work'] }),
      note({ labelIds: ['work', 'home', 'trip'] }),
    ];
    const { checked, mixed } = selectBulkLabels(notes);
    expect(checked).toEqual(['work']);
    expect(mixed.sort()).toEqual(['home', 'trip']);
  });

  it('counts a label once per note and reports none for an empty selection', () => {
    // A duplicated id in one note must not pass for "every note has it".
    const { checked, mixed } = selectBulkLabels([
      note({ labelIds: ['work', 'work'] }),
      note({ labelIds: [] }),
    ]);
    expect(checked).toEqual([]);
    expect(mixed).toEqual(['work']);
    expect(selectBulkLabels([])).toEqual({ checked: [], mixed: [] });
  });
});

describe('templates', () => {
  const tpl = (over: Partial<FullNote> = {}) => note({ isTemplate: true, ...over });

  it('takes templates out of every view but their own', () => {
    const shape = tpl({ title: 'shape' });
    const archivedShape = tpl({ title: 'archived shape', archived: true });
    const plain = note({ title: 'plain' });

    const notes = [shape, archivedShape, plain];
    expect(selectMain(notes).others.map((n) => n.title)).toEqual(['plain']);
    expect(selectArchived(notes)).toEqual([]);
    expect(
      selectTemplates(notes)
        .map((n) => n.title)
        .sort(),
    ).toEqual(['archived shape', 'shape']);
    expect(selectHasTemplates(notes)).toBe(true);
    expect(selectHasTemplates([plain])).toBe(false);
  });

  it('lets the trash outrank the shelf', () => {
    const trashedShape = tpl({ title: 'trashed shape', trashedAt: '2026-07-25T00:00:00.000Z' });
    expect(selectTemplates([trashedShape])).toEqual([]);
    expect(selectTrashed([trashedShape]).map((n) => n.title)).toEqual(['trashed shape']);
    expect(selectHasTemplates([trashedShape])).toBe(false);
  });

  it('never offers a template as a link target', () => {
    const shape = tpl({ title: 'shape' });
    const plain = note({ title: 'plain' });
    expect(selectLinkTargets([shape, plain], null, '').map((n) => n.title)).toEqual(['plain']);
  });
});

describe('note links', () => {
  const target = note({ title: 'Reforma' });
  const linkHtml = `<p>ver <a href="?note=${target.id}">Reforma</a></p>`;

  it('offers link targets by recency, never the note being written in', () => {
    const older = note({ title: 'Antiga', updatedAt: '2026-07-01T00:00:00.000Z' });
    const newer = note({ title: 'Recente', updatedAt: '2026-07-30T00:00:00.000Z' });
    const trashed = note({ title: 'Lixo', trashedAt: '2026-07-02T00:00:00.000Z' });
    const notes = [older, newer, trashed, target];

    const ids = selectLinkTargets(notes, target.id, '').map((n) => n.id);
    expect(ids).toEqual([newer.id, older.id]);
    expect(selectLinkTargets(notes, target.id, 'rec').map((n) => n.title)).toEqual(['Recente']);
  });

  it('finds the notes whose body links here, and only those', () => {
    const source = note({ bodyHtml: linkHtml });
    // Same id in the text, but not as a link: a note that merely mentions the
    // deep link is not a backlink.
    const mentions = note({ bodyHtml: `<p>?note=${target.id}</p>` });
    const otherLink = note({
      bodyHtml: '<p><a href="?note=01890000-0000-7000-8000-999999999999">x</a></p>',
    });
    const trashedSource = note({ bodyHtml: linkHtml, trashedAt: '2026-07-02T00:00:00.000Z' });
    const selfLink = { ...target, bodyHtml: linkHtml };

    const found = selectBacklinks(
      [source, mentions, otherLink, trashedSource, selfLink],
      target.id,
    );
    expect(found.map((n) => n.id)).toEqual([source.id]);
  });
});
