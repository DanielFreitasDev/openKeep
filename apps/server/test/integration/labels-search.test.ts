import type { FullNote, Label } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('labels', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('labels@example.com', 'Labels');
  });
  afterAll(async () => {
    await t.close();
  });

  const createLabel = async (name: string, expectStatus = 201) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie },
      payload: { name },
    });
    expect(res.statusCode).toBe(expectStatus);
    return res.statusCode === 201 ? (res.json() as Label) : res.json();
  };

  it('creates, lists alphabetically, renames and deletes labels', async () => {
    await createLabel('Work');
    await createLabel('alpha');
    const list = await t.app.inject({ method: 'GET', url: '/api/labels', headers: { cookie } });
    expect((list.json() as Label[]).map((l) => l.name)).toEqual(['alpha', 'Work']);

    const alpha = (list.json() as Label[])[0]!;
    const renamed = await t.app.inject({
      method: 'PATCH',
      url: `/api/labels/${alpha.id}`,
      headers: { cookie },
      payload: { name: 'Beta' },
    });
    expect(renamed.statusCode).toBe(200);

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/labels/${alpha.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it('rejects duplicates case-insensitively', async () => {
    await createLabel('Ideas');
    const dup = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie },
      payload: { name: 'ideas' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('label_exists');
  });

  it('enforces the 50-label cap', async () => {
    const fresh = await createTestApp();
    try {
      const c = await fresh.signUp('cap@example.com', 'Cap');
      for (let i = 0; i < 50; i++) {
        const res = await fresh.app.inject({
          method: 'POST',
          url: '/api/labels',
          headers: { cookie: c },
          payload: { name: `label-${i}` },
        });
        expect(res.statusCode).toBe(201);
      }
      const over = await fresh.app.inject({
        method: 'POST',
        url: '/api/labels',
        headers: { cookie: c },
        payload: { name: 'one-too-many' },
      });
      expect(over.statusCode).toBe(400);
      expect(over.json().code).toBe('label_limit_reached');
    } finally {
      await fresh.close();
    }
  });

  it('assigns and removes labels on notes (idempotent), reflected in FullNote', async () => {
    const label = (await createLabel('Chips')) as Label;
    const noteRes = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'Labeled' },
    });
    const note = noteRes.json() as FullNote;

    for (let i = 0; i < 2; i++) {
      const put = await t.app.inject({
        method: 'PUT',
        url: `/api/notes/${note.id}/labels/${label.id}`,
        headers: { cookie },
      });
      expect(put.statusCode).toBe(204);
    }

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const fetched = (list.json() as FullNote[]).find((n) => n.id === note.id);
    expect(fetched?.labelIds).toEqual([label.id]);

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}/labels/${label.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it("cannot use someone else's label on my note", async () => {
    const other = await t.signUp('other-labels@example.com', 'Other');
    const otherLabel = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: other },
      payload: { name: 'NotYours' },
    });
    const noteRes = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'Mine' },
    });
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${(noteRes.json() as FullNote).id}/labels/${(otherLabel.json() as Label).id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('copying a note clones my labels', async () => {
    const label = (await createLabel('CopyMe')) as Label;
    const noteRes = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'Copy labels' },
    });
    const note = noteRes.json() as FullNote;
    await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${note.id}/labels/${label.id}`,
      headers: { cookie },
    });

    const copy = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/copy`,
      headers: { cookie },
    });
    expect((copy.json() as FullNote).labelIds).toEqual([label.id]);
  });
});

describe('search (FTS)', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('search@example.com', 'Search');

    const make = (payload: Record<string, unknown>) =>
      t.app.inject({ method: 'POST', url: '/api/notes', headers: { cookie }, payload });

    await make({ title: 'Ação de graças', bodyHtml: '<p>Receita de peru</p>' });
    await make({ title: 'Groceries', bodyHtml: '<p>See https://example.com/list</p>' });
    await make({
      title: 'Compras',
      type: 'list',
      items: [{ text: 'Café torrado' }, { text: 'Pão francês' }],
    });
    const archived = await make({ title: 'Archived treasure', bodyHtml: '<p>gold coin</p>' });
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${(archived.json() as FullNote).id}/state`,
      headers: { cookie },
      payload: { archived: true },
    });
    const trashed = await make({ title: 'Trashed secret', bodyHtml: '<p>gold bar</p>' });
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${(trashed.json() as FullNote).id}/trash`,
      headers: { cookie },
    });
  });
  afterAll(async () => {
    await t.close();
  });

  const search = async (qs: string) => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/search?${qs}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as FullNote[]).map((n) => n.title);
  };

  it('matches accent-insensitively in both directions (PT/EN)', async () => {
    expect(await search('q=acao')).toContain('Ação de graças');
    expect(await search('q=ação')).toContain('Ação de graças');
    expect(await search('q=cafe')).toContain('Compras'); // item text match
  });

  it('matches word prefixes', async () => {
    expect(await search('q=groc')).toContain('Groceries');
    expect(await search('q=receit')).toContain('Ação de graças');
  });

  it('includes archived, excludes trashed', async () => {
    const titles = await search('q=gold');
    expect(titles).toContain('Archived treasure');
    expect(titles).not.toContain('Trashed secret');
  });

  it('filters by type', async () => {
    expect(await search('type=list')).toEqual(['Compras']);
    expect(await search('type=url')).toEqual(['Groceries']);
    expect(await search('type=image')).toEqual([]);
  });

  it('filters by color and label', async () => {
    const labelRes = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie },
      payload: { name: 'Receitas' },
    });
    const label = labelRes.json() as Label;
    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const acao = (list.json() as FullNote[]).find((n) => n.title.startsWith('Ação'))!;
    await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${acao.id}/labels/${label.id}`,
      headers: { cookie },
    });
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${acao.id}/state`,
      headers: { cookie },
      payload: { color: 'coral' },
    });

    expect(await search('label=receitas')).toEqual(['Ação de graças']);
    expect(await search('color=coral')).toEqual(['Ação de graças']);
    expect(await search('q=peru&color=coral')).toEqual(['Ação de graças']);
    expect(await search('q=groceries&color=coral')).toEqual([]);
  });

  it('neutralizes tsquery operator injection', async () => {
    // Operators are stripped; remaining terms AND-join: gold + coin both
    // appear in "Archived treasure" (and nothing 500s).
    expect(await search(`q=${encodeURIComponent("gold & !coin | ')")}`)).toContain(
      'Archived treasure',
    );
    expect(await search(`q=${encodeURIComponent('(((*&|!')}`)).toBeInstanceOf(Array);
  });
});
