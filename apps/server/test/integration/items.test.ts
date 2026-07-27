import type { FullNote, NoteItem } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('checklist items', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('lists@example.com', 'Lists');
  });
  afterAll(async () => {
    await t.close();
  });

  const createList = async (items: { text: string; checked?: boolean; indent?: 0 | 1 }[] = []) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { type: 'list', title: 'List', items },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  it('adds items honoring the add-to-bottom setting', async () => {
    const note = await createList([{ text: 'first' }]);

    const bottom = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/items`,
      headers: { cookie },
      payload: { text: 'appended' },
    });
    expect(bottom.statusCode).toBe(201);
    const appended = bottom.json() as NoteItem;
    expect(appended.position > note.items[0]!.position).toBe(true);

    // Flip the setting → new items go to the top.
    await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { addItemsToBottom: false },
    });
    const top = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/items`,
      headers: { cookie },
      payload: { text: 'prepended' },
    });
    const prepended = top.json() as NoteItem;
    expect(prepended.position < note.items[0]!.position).toBe(true);
    await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { addItemsToBottom: true },
    });
  });

  it('rejects items on text notes', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { type: 'text', title: 'T' },
    });
    const textNote = res.json() as FullNote;
    const add = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${textNote.id}/items`,
      headers: { cookie },
      payload: { text: 'nope' },
    });
    expect(add.statusCode).toBe(400);
  });

  it('patches item fields (text/checked/indent/position)', async () => {
    const note = await createList([{ text: 'a' }, { text: 'b' }]);
    const item = note.items[1]!;

    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}/items/${item.id}`,
      headers: { cookie },
      payload: { text: 'b2', checked: true, indent: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item).toMatchObject({ text: 'b2', checked: true, indent: 1 });
    expect(body.cascaded).toEqual([]);
  });

  it('checking a parent cascades to its indent-1 run (and unchecking reverts)', async () => {
    const note = await createList([
      { text: 'parent' },
      { text: 'child1', indent: 1 },
      { text: 'child2', indent: 1 },
      { text: 'other parent' },
      { text: 'other child', indent: 1 },
    ]);
    const parent = note.items[0]!;

    const check = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}/items/${parent.id}`,
      headers: { cookie },
      payload: { checked: true },
    });
    const checked = check.json();
    expect(checked.cascaded.map((i: NoteItem) => i.text).sort()).toEqual(['child1', 'child2']);
    expect(checked.cascaded.every((i: NoteItem) => i.checked)).toBe(true);

    const uncheck = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}/items/${parent.id}`,
      headers: { cookie },
      payload: { checked: false },
    });
    expect(uncheck.json().cascaded.every((i: NoteItem) => !i.checked)).toBe(true);
  });

  it('uncheck-all and delete-checked', async () => {
    const note = await createList([
      { text: 'keep', checked: false },
      { text: 'done1', checked: true },
      { text: 'done2', checked: true },
    ]);

    const unchecked = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/uncheck-all`,
      headers: { cookie },
    });
    expect(unchecked.json().items.every((i: NoteItem) => !i.checked)).toBe(true);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}/items/${note.items[1]!.id}`,
      headers: { cookie },
      payload: { checked: true },
    });
    const deleted = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/delete-checked`,
      headers: { cookie },
    });
    const remaining = deleted.json().items.map((i: NoteItem) => i.text);
    expect(remaining).toEqual(['keep', 'done2']);
  });

  it('rejects an item id from another note (no cross-note access)', async () => {
    const a = await createList([{ text: 'a-item' }]);
    const b = await createList([{ text: 'b-item' }]);
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${a.id}/items/${b.items[0]!.id}`,
      headers: { cookie },
      payload: { text: 'stolen' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes an item', async () => {
    const note = await createList([{ text: 'gone' }, { text: 'stays' }]);
    const res = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}/items/${note.items[0]!.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const fetched = (list.json() as FullNote[]).find((n) => n.id === note.id);
    expect(fetched?.items.map((i) => i.text)).toEqual(['stays']);
  });

  it('blocks item edits on trashed notes', async () => {
    const note = await createList([{ text: 'x' }]);
    await t.app.inject({ method: 'POST', url: `/api/notes/${note.id}/trash`, headers: { cookie } });
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}/items/${note.items[0]!.id}`,
      headers: { cookie },
      payload: { checked: true },
    });
    expect(res.statusCode).toBe(409);
  });
});
