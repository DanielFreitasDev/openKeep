import type { FullNote } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeForSearch, selectSearch } from './note-selectors.js';

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
});
