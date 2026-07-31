import type { Collaborator, FullNote } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeForSearch, selectPeople, selectSearch } from './note-selectors.js';

const me: Collaborator = { userId: 'me', email: 'me@x.dev', name: 'Me', role: 'owner' };
const ana: Collaborator = {
  userId: 'u-ana',
  email: 'ana@x.dev',
  name: 'Ana',
  role: 'collaborator',
};
const bo: Collaborator = { userId: 'u-bo', email: 'bo@x.dev', name: 'Bo', role: 'collaborator' };

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
    color: 'default',
    background: 'none',
    position: `a${seq}`,
    trashedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('normalizeForSearch', () => {
  it('folds accents and case (client twin of unaccent)', () => {
    expect(normalizeForSearch('Ação CAFÉ pão')).toBe('acao cafe pao');
  });
});

describe('matchesQuery', () => {
  it('matches word prefixes across title, body html and items', () => {
    const n = note({
      title: 'Groceries',
      bodyHtml: '<p><strong>Récipe</strong> list</p>',
      items: [{ id: 'i1', text: 'Café torrado', checked: false, indent: 0, position: 'a' }],
    });
    expect(matchesQuery(n, 'groc')).toBe(true);
    expect(matchesQuery(n, 'recipe')).toBe(true); // accent-folded
    expect(matchesQuery(n, 'cafe torr')).toBe(true); // multi-word AND
    expect(matchesQuery(n, 'cafe missing')).toBe(false);
    expect(matchesQuery(n, 'roceries')).toBe(false); // prefix only, not substring
  });
});

describe('selectSearch', () => {
  const corpus = [
    note({ title: 'Plain match', bodyHtml: '<p>hello world</p>' }),
    note({ title: 'Archived match', bodyHtml: '<p>hello there</p>', archived: true }),
    note({
      title: 'Trashed match',
      bodyHtml: '<p>hello gone</p>',
      trashedAt: '2026-07-20T00:00:00.000Z',
    }),
    note({
      title: 'List note',
      type: 'list',
      items: [{ id: 'x', text: 'hello item', checked: false, indent: 0, position: 'a' }],
    }),
    note({ title: 'Linked', bodyHtml: '<p>see https://x.dev</p>', hasLinks: true }),
    note({ title: 'Colored', bodyHtml: '<p>hello paint</p>', color: 'coral' }),
    note({ title: 'Labeled', bodyHtml: '<p>hello tag</p>', labelIds: ['lbl-1'] }),
    note({ title: 'Shared with Ana', bodyHtml: '<p>hello ana</p>', collaborators: [me, ana] }),
    note({ title: 'Shared with Bo', bodyHtml: '<p>hello bo</p>', collaborators: [me, bo] }),
  ];

  it('returns nothing when no query or filters', () => {
    const r = selectSearch(corpus, { q: '' });
    expect(r.active).toHaveLength(0);
    expect(r.archived).toHaveLength(0);
  });

  it('splits active vs archived and excludes trash', () => {
    const r = selectSearch(corpus, { q: 'hello' });
    expect(r.active.map((n) => n.title)).not.toContain('Trashed match');
    expect(r.archived.map((n) => n.title)).toEqual(['Archived match']);
    expect(r.active.length).toBeGreaterThanOrEqual(4);
  });

  it('applies type, color and label filters (combinable with text)', () => {
    expect(selectSearch(corpus, { q: '', type: 'list' }).active.map((n) => n.title)).toEqual([
      'List note',
    ]);
    expect(selectSearch(corpus, { q: '', type: 'url' }).active.map((n) => n.title)).toEqual([
      'Linked',
    ]);
    expect(selectSearch(corpus, { q: '', color: 'coral' }).active.map((n) => n.title)).toEqual([
      'Colored',
    ]);
    expect(selectSearch(corpus, { q: '', labelId: 'lbl-1' }).active.map((n) => n.title)).toEqual([
      'Labeled',
    ]);
    expect(selectSearch(corpus, { q: 'paint', color: 'coral' }).active).toHaveLength(1);
    expect(selectSearch(corpus, { q: 'nothing', color: 'coral' }).active).toHaveLength(0);
  });

  it('filters by collaborator, combinable with text', () => {
    expect(
      selectSearch(corpus, { q: '', collaboratorId: 'u-ana' }).active.map((n) => n.title),
    ).toEqual(['Shared with Ana']);
    expect(selectSearch(corpus, { q: 'hello', collaboratorId: 'u-bo' }).active).toHaveLength(1);
    expect(selectSearch(corpus, { q: 'ana', collaboratorId: 'u-bo' }).active).toHaveLength(0);
    expect(selectSearch(corpus, { q: '', collaboratorId: 'nobody' }).active).toHaveLength(0);
  });

  describe('operators', () => {
    const opCorpus = [
      note({ title: 'Pinned note', bodyHtml: '<p>hello</p>', pinned: true }),
      note({ title: 'Coral list', type: 'list', color: 'coral' }),
      note({ title: 'Old edit', bodyHtml: '<p>hello</p>', updatedAt: '2026-01-05T23:00:00.000Z' }),
      note({ title: 'Tagged', bodyHtml: '<p>hello</p>', labelIds: ['lbl-1'] }),
      note({ title: 'Archived one', bodyHtml: '<p>hello</p>', archived: true }),
    ];
    const titles = (q: string, extra = {}) =>
      selectSearch(opCorpus, { q, ...extra }).active.map((n) => n.title);

    it('filters by is:, has: and color:', () => {
      expect(titles('is:pinned')).toEqual(['Pinned note']);
      expect(titles('-is:pinned')).toEqual(['Coral list', 'Old edit', 'Tagged']);
      expect(titles('has:list')).toEqual(['Coral list']);
      expect(titles('color:coral')).toEqual(['Coral list']);
      expect(titles('color:red')).toEqual(['Coral list']); // everyday color word
      expect(titles('-color:coral')).toEqual(['Pinned note', 'Old edit', 'Tagged']);
    });

    it('sends is:archived to the archived section, not the active one', () => {
      const r = selectSearch(opCorpus, { q: 'is:archived' });
      expect(r.active).toEqual([]);
      expect(r.archived.map((n) => n.title)).toEqual(['Archived one']);
    });

    it('filters by the edited day, UTC and inclusive on after:', () => {
      expect(titles('before:2026-02-01')).toEqual(['Old edit']);
      expect(titles('after:2026-01-05')).toContain('Old edit');
      expect(titles('after:2026-01-06')).not.toContain('Old edit');
    });

    it('takes label names already resolved to ids by the caller', () => {
      expect(titles('label:whatever', { labelIds: ['lbl-1'] })).toEqual(['Tagged']);
      // An unknown name resolves to itself, which no note carries.
      expect(titles('label:typo', { labelIds: ['typo'] })).toEqual([]);
      expect(titles('hello', { notLabelIds: ['lbl-1'] })).toEqual(['Pinned note', 'Old edit']);
    });

    it('excludes words with -, combined with text and operators', () => {
      expect(titles('hello -tagged')).toEqual(['Pinned note', 'Old edit']);
      expect(titles('hello -pinned is:unpinned')).toEqual(['Old edit', 'Tagged']);
    });

    it('treats an unparseable operator as text', () => {
      expect(titles('color:banana')).toEqual([]);
      expect(titles('is:pinned has:image')).toEqual([]);
    });
  });
});

describe('selectPeople', () => {
  it('dedupes collaborators, drops me and trashed notes, sorts by name', () => {
    const people = selectPeople(
      [
        note({ collaborators: [me, bo] }),
        note({ collaborators: [me, ana] }),
        note({ collaborators: [me, ana] }),
        note({
          collaborators: [me, { userId: 'u-zed', email: 'z@x.dev', name: 'Zed', role: 'owner' }],
          trashedAt: '2026-07-20T00:00:00.000Z',
        }),
      ],
      'me',
    );
    expect(people.map((p) => p.userId)).toEqual(['u-ana', 'u-bo']);
  });
});
