import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

/**
 * Templates are a bucket of the board, not a new kind of note: the flag lives
 * on the membership, so what these tests pin down is which views let it
 * through and which do not.
 */
describe('note templates', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('templates@example.com', 'Templater');
  });
  afterAll(async () => {
    await t.close();
  });

  const create = async (body: Record<string, unknown> = {}) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  const setTemplate = async (id: string, isTemplate: boolean) => {
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${id}/state`,
      headers: { cookie },
      payload: { isTemplate },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  };

  const list = async (view?: string) => {
    const res = await t.app.inject({
      method: 'GET',
      url: view ? `/api/notes?view=${view}` : '/api/notes',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as FullNote[];
  };

  it('a note saved as a template leaves the board and lands on the shelf', async () => {
    const n = await create({ title: 'Meeting minutes' });
    expect(n.isTemplate).toBe(false);
    expect((await list('active')).map((x) => x.id)).toContain(n.id);

    expect(await setTemplate(n.id, true)).toMatchObject({ id: n.id, isTemplate: true });

    expect((await list('active')).map((x) => x.id)).not.toContain(n.id);
    expect((await list('templates')).map((x) => x.id)).toContain(n.id);

    // And the same gesture puts it back, with nothing else about it changed.
    await setTemplate(n.id, false);
    expect((await list('active')).map((x) => x.id)).toContain(n.id);
    expect((await list('templates')).map((x) => x.id)).not.toContain(n.id);
  });

  it('keeps templates out of the archive, and the archived flag under them', async () => {
    const n = await create({ title: 'Archived shape' });
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${n.id}/state`,
      headers: { cookie },
      payload: { archived: true },
    });
    await setTemplate(n.id, true);

    expect((await list('archived')).map((x) => x.id)).not.toContain(n.id);
    expect((await list('templates')).map((x) => x.id)).toContain(n.id);

    // Off the shelf it goes back to the archive it came from: the two flags
    // are independent, and un-templating restores what was underneath.
    await setTemplate(n.id, false);
    expect((await list('archived')).map((x) => x.id)).toContain(n.id);
  });

  it('the trash outranks the shelf', async () => {
    const n = await create({ title: 'Doomed template' });
    await setTemplate(n.id, true);
    await t.app.inject({ method: 'POST', url: `/api/notes/${n.id}/trash`, headers: { cookie } });

    expect((await list('templates')).map((x) => x.id)).not.toContain(n.id);
    expect((await list('trash')).map((x) => x.id)).toContain(n.id);

    // Restoring returns it to the shelf, still a template.
    await t.app.inject({ method: 'POST', url: `/api/notes/${n.id}/restore`, headers: { cookie } });
    expect((await list('templates')).map((x) => x.id)).toContain(n.id);
  });

  it('excludes templates from search', async () => {
    const n = await create({ title: 'Sonnenblume', bodyHtml: '<p>only on the shelf</p>' });
    const found = await t.app.inject({
      method: 'GET',
      url: '/api/search?q=sonnenblume',
      headers: { cookie },
    });
    expect((found.json() as FullNote[]).map((x) => x.id)).toContain(n.id);

    await setTemplate(n.id, true);
    const afterwards = await t.app.inject({
      method: 'GET',
      url: '/api/search?q=sonnenblume',
      headers: { cookie },
    });
    expect((afterwards.json() as FullNote[]).map((x) => x.id)).not.toContain(n.id);
  });

  /**
   * "Use template" is the copy the app already makes — which is exactly why
   * the copy must NOT inherit the flag, or every use would leave a second
   * template behind instead of a note.
   */
  it('a copy of a template is an ordinary note', async () => {
    const tpl = await create({ title: 'Weekly review', bodyHtml: '<p>What went well?</p>' });
    await setTemplate(tpl.id, true);

    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${tpl.id}/copy`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(201);
    const copy = res.json() as FullNote;
    expect(copy.id).not.toBe(tpl.id);
    expect(copy.isTemplate).toBe(false);
    expect(copy.title).toBe('Weekly review');
    expect(copy.bodyHtml).toBe('<p>What went well?</p>');
    expect((await list('active')).map((x) => x.id)).toContain(copy.id);
  });

  it('the whole corpus still carries templates (the client filters its own views)', async () => {
    const n = await create({ title: 'In the corpus' });
    await setTemplate(n.id, true);
    const all = await list();
    expect(all.find((x) => x.id === n.id)?.isTemplate).toBe(true);
  });
});
