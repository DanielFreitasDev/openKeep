import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('merging notes', () => {
  let t: TestApp;
  let cookie: string;
  let otherCookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('merger@example.com', 'Merger');
    otherCookie = await t.signUp('bystander@example.com', 'Bystander');
  });
  afterAll(async () => {
    await t.close();
  });

  const create = async (body: Record<string, unknown> = {}, as = cookie) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: as },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  const merge = (noteIds: string[], as = cookie) =>
    t.app.inject({
      method: 'POST',
      url: '/api/notes/merge',
      headers: { cookie: as },
      payload: { noteIds },
    });

  const get = async (id: string, as = cookie) => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${id}`,
      headers: { cookie: as },
    });
    return res.json() as FullNote;
  };

  it('folds text notes into the first one and trashes the rest', async () => {
    const a = await create({ title: 'Trip', bodyHtml: '<p>flights booked</p>' });
    const b = await create({ title: 'Hotel', bodyHtml: '<p>check in <strong>friday</strong></p>' });
    const c = await create({ bodyHtml: '<p>untitled tail</p>' });

    const res = await merge([a.id, b.id, c.id]);
    expect(res.statusCode).toBe(200);
    const merged = res.json() as FullNote;

    // The survivor keeps its own id and title — deep links do not break.
    expect(merged.id).toBe(a.id);
    expect(merged.title).toBe('Trip');
    expect(merged.bodyHtml).toContain('flights booked');
    // A source title becomes a section head, not a second document title.
    expect(merged.bodyHtml).toContain('<h2>Hotel</h2>');
    expect(merged.bodyHtml).toContain('<strong>friday</strong>');
    expect(merged.bodyHtml).toContain('untitled tail');
    expect(merged.trashedAt).toBeNull();

    expect((await get(b.id)).trashedAt).not.toBeNull();
    expect((await get(c.id)).trashedAt).not.toBeNull();
  });

  it('leaves the pre-merge content in the version history', async () => {
    const a = await create({ title: 'Before', bodyHtml: '<p>original</p>' });
    const b = await create({ bodyHtml: '<p>added</p>' });
    await merge([a.id, b.id]);

    const res = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${a.id}/versions`,
      headers: { cookie },
    });
    expect(res.json()).toHaveLength(1);
  });

  it('appends items when the survivor is a list, titles included', async () => {
    const list = await create({
      type: 'list',
      title: 'Groceries',
      items: [{ text: 'milk', checked: false, indent: 0 }],
    });
    const otherList = await create({
      type: 'list',
      items: [{ text: 'bread', checked: true, indent: 0 }],
    });
    const text = await create({ title: 'Also', bodyHtml: '<p>eggs</p>' });

    const res = await merge([list.id, otherList.id, text.id]);
    expect(res.statusCode).toBe(200);
    const merged = res.json() as FullNote;

    expect(merged.type).toBe('list');
    expect(merged.items.map((i) => i.text)).toEqual(['milk', 'bread', 'Also', 'eggs']);
    // Check state survives the trip.
    expect(merged.items.find((i) => i.text === 'bread')?.checked).toBe(true);
  });

  it('reads a merged list source as markdown when the survivor is text', async () => {
    const text = await create({ title: 'Plan', bodyHtml: '<p>intro</p>' });
    const list = await create({
      type: 'list',
      title: 'Steps',
      items: [
        { text: 'one', checked: true, indent: 0 },
        { text: 'two', checked: false, indent: 0 },
      ],
    });

    const merged = (await merge([text.id, list.id])).json() as FullNote;
    expect(merged.type).toBe('text');
    expect(merged.bodyHtml).toContain('one');
    expect(merged.bodyHtml).toContain('two');
  });

  it('unions my labels onto the survivor', async () => {
    const label = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie },
      payload: { name: 'travel' },
    });
    const labelId = (label.json() as { id: string }).id;

    const a = await create({ title: 'Keeps labels' });
    const b = await create({ title: 'Brings a label' });
    await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${b.id}/labels/${labelId}`,
      headers: { cookie },
    });

    const merged = (await merge([a.id, b.id])).json() as FullNote;
    expect(merged.labelIds).toContain(labelId);
  });

  it('rejects a merge that is not entirely mine', async () => {
    const mine = await create({ title: 'Mine' });
    const theirs = await create({ title: 'Theirs' }, otherCookie);

    const res = await merge([mine.id, theirs.id]);
    expect(res.statusCode).toBe(404);
    // Nothing moved.
    expect((await get(theirs.id, otherCookie)).trashedAt).toBeNull();
  });

  it('needs at least two distinct notes', async () => {
    const only = await create({ title: 'Alone' });
    expect((await merge([only.id, only.id])).statusCode).toBe(400);
    const one = await t.app.inject({
      method: 'POST',
      url: '/api/notes/merge',
      headers: { cookie },
      payload: { noteIds: [only.id] },
    });
    expect(one.statusCode).toBe(400);
  });

  it('refuses to merge a trashed note', async () => {
    const a = await create({ title: 'Live' });
    const b = await create({ title: 'Gone' });
    await t.app.inject({ method: 'POST', url: `/api/notes/${b.id}/trash`, headers: { cookie } });

    expect((await merge([a.id, b.id])).statusCode).toBe(409);
  });
});
