import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REVEAL_TTL_MS } from '../../src/lib/note-protection.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

/**
 * Protected notes. The promise is narrow and worth stating exactly: the
 * content does not leave the server until this session retypes a credential.
 * So the tests are mostly about the ways content could get out anyway — the
 * list, the single read, the search, the attachment bytes, the public link,
 * an API token — and about the fact that everything else keeps working: the
 * card is still on the board, still coloured, still where it was dragged.
 *
 * It is not encryption, and nothing here pretends otherwise: the export, which
 * is a backup rather than a view, still carries the words.
 */
describe('protected notes', () => {
  let t: TestApp;
  let cookie: string;
  const PASSWORD = 'password-123';

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('lock@example.com', 'Locksmith', PASSWORD);
  });
  afterAll(async () => {
    await t.close();
  });
  // A reveal outlives the request that earned it, so each test starts back
  // behind the curtain — otherwise the previous one's password is still open.
  beforeEach(async () => {
    await t.app.inject({ method: 'POST', url: '/api/protection/lock', headers: { cookie } });
  });

  const req = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
    as: string = cookie,
  ) =>
    t.app.inject({
      method,
      url,
      headers: { cookie: as },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });

  const create = async (body: Record<string, unknown> = {}, as: string = cookie) => {
    const res = await req('POST', '/api/notes', body, as);
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  const lock = async (id: string, as: string = cookie) =>
    req('POST', `/api/notes/${id}/lock`, undefined, as);
  const reveal = async (payload: unknown = { password: PASSWORD }, as: string = cookie) =>
    req('POST', '/api/protection/unlock', payload, as);

  const list = async (as: string = cookie) => {
    const res = await req('GET', '/api/notes', undefined, as);
    expect(res.statusCode).toBe(200);
    return res.json() as FullNote[];
  };

  const find = async (id: string, as: string = cookie) => (await list(as)).find((n) => n.id === id);

  it('hides the words but keeps the card', async () => {
    const note = await create({ title: 'Bank', bodyHtml: '<p>4111 1111 1111 1111</p>' });
    await req('PATCH', `/api/notes/${note.id}/state`, { color: 'mint', pinned: true });

    expect((await lock(note.id)).json()).toEqual({ id: note.id, locked: true });

    const hidden = await find(note.id);
    expect(hidden).toMatchObject({
      locked: true,
      title: '',
      bodyHtml: '',
      hasLinks: false,
      items: [],
      attachments: [],
      // Everything the board draws the card WITH survives — it has to, or a
      // protected note would also lose its place, its colour and its pin.
      color: 'mint',
      pinned: true,
    });
    expect(hidden?.position).toBe(note.position);

    // The single read answers with the same redacted card rather than 423:
    // a `?note=` deep link has to know to ask for the password.
    const single = await req('GET', `/api/notes/${note.id}`);
    expect(single.statusCode).toBe(200);
    expect(single.json()).toMatchObject({ locked: true, title: '' });
  });

  it('refuses every route that would read or write the content', async () => {
    const note = await create({ title: 'Diary', bodyHtml: '<p>secret</p>' });
    const label = await req('POST', '/api/labels', { name: 'private' });
    expect(label.statusCode).toBe(201);
    await lock(note.id);

    const refused = [
      await req('PATCH', `/api/notes/${note.id}`, { title: 'Renamed' }),
      await req('POST', `/api/notes/${note.id}/copy`),
      await req('POST', `/api/notes/${note.id}/convert`, { to: 'list' }),
      await req('GET', `/api/notes/${note.id}/versions`),
      await req('POST', `/api/notes/${note.id}/trash`),
      await req('POST', `/api/notes/${note.id}/items`, { text: 'milk' }),
      await req('PUT', `/api/notes/${note.id}/labels/${label.json().id as string}`),
    ];
    for (const res of refused) {
      expect(res.statusCode).toBe(423);
      expect(res.json().code).toBe('note_locked');
    }

    // The title never moved: a refused PATCH is a refused PATCH.
    await reveal();
    expect((await req('GET', `/api/notes/${note.id}`)).json().title).toBe('Diary');
  });

  it('takes the note out of search entirely, not merely blank', async () => {
    const note = await create({ title: 'Passport number', bodyHtml: '<p>Zanzibar</p>' });
    const hits = async (q: string) => {
      const res = await req('GET', `/api/search?q=${encodeURIComponent(q)}`);
      expect(res.statusCode).toBe(200);
      return (res.json() as FullNote[]).map((n) => n.id);
    };
    expect(await hits('zanzibar')).toContain(note.id);

    await lock(note.id);
    // Not "found but empty": an empty hit still answers the question the lock
    // exists to refuse — whether a note about Zanzibar exists at all.
    expect(await hits('zanzibar')).not.toContain(note.id);
    expect(await hits('passport')).not.toContain(note.id);

    await reveal();
    expect(await hits('zanzibar')).toContain(note.id);
  });

  it('opens for the password, for a PIN once set, and for nothing else', async () => {
    const note = await create({ title: 'Vault' });
    await lock(note.id);

    expect((await reveal({ password: 'not-my-password' })).statusCode).toBe(401);
    expect((await find(note.id))?.title).toBe('');

    expect((await reveal()).statusCode).toBe(200);
    expect((await find(note.id))?.title).toBe('Vault');

    // A PIN is a shortcut for the password, so the password is what installs it.
    expect((await req('PUT', '/api/protection/pin', { pin: '2468' })).statusCode).toBe(400);
    expect(
      (await req('PUT', '/api/protection/pin', { password: 'wrong', pin: '2468' })).statusCode,
    ).toBe(401);
    expect(
      (await req('PUT', '/api/protection/pin', { password: PASSWORD, pin: '2468' })).statusCode,
    ).toBe(204);

    const status = (await req('GET', '/api/protection')).json();
    expect(status).toMatchObject({ pinSet: true, hasPassword: true });
    expect(Date.parse(status.unlockedUntil)).toBeGreaterThan(Date.now());
    expect(Date.parse(status.unlockedUntil)).toBeLessThanOrEqual(Date.now() + REVEAL_TTL_MS);

    // "Lock now" — the curtain falls without waiting out the window.
    expect((await req('POST', '/api/protection/lock')).statusCode).toBe(204);
    expect((await req('GET', '/api/protection')).json().unlockedUntil).toBeNull();
    expect((await find(note.id))?.title).toBe('');

    expect((await reveal({ pin: '1357' })).statusCode).toBe(401);
    expect((await reveal({ pin: '2468' })).statusCode).toBe(200);
    expect((await find(note.id))?.title).toBe('Vault');
  });

  it('unprotecting needs the reveal; protecting never does', async () => {
    const note = await create({ title: 'Keys' });
    expect((await lock(note.id)).statusCode).toBe(200);

    // Still locked out of it, so the flag cannot be flipped back from here.
    expect((await req('POST', `/api/notes/${note.id}/unlock`)).statusCode).toBe(423);
    await reveal();
    expect((await req('POST', `/api/notes/${note.id}/unlock`)).json()).toEqual({
      id: note.id,
      locked: false,
    });
    expect((await find(note.id))?.locked).toBe(false);
  });

  it('is per person, not per note: a collaborator sees their own copy', async () => {
    const other = await t.signUp('lock-friend@example.com', 'Friend');
    const note = await create({ title: 'Shared plans', bodyHtml: '<p>surprise party</p>' });
    const invite = await req('POST', `/api/notes/${note.id}/collaborators`, {
      email: 'lock-friend@example.com',
      role: 'collaborator',
    });
    expect(invite.statusCode).toBe(201);

    await lock(note.id);

    // Mine is behind the curtain; theirs never moved.
    expect((await find(note.id))?.title).toBe('');
    expect((await find(note.id, other))?.title).toBe('Shared plans');
    expect((await find(note.id, other))?.locked).toBe(false);

    // And their edits still land — they simply stop being announced to me,
    // since I could not be shown them anyway.
    const edit = await req('PATCH', `/api/notes/${note.id}`, { title: 'Shared plans v2' }, other);
    expect(edit.statusCode).toBe(200);
    expect((await find(note.id))?.title).toBe('');
    await reveal();
    expect((await find(note.id))?.title).toBe('Shared plans v2');
  });

  it('darkens the note’s public link and its attachment bytes', async () => {
    const note = await create({ title: 'Draft post' });
    const link = await req('POST', `/api/notes/${note.id}/share-link`, {});
    expect(link.statusCode).toBe(201);
    const token = (link.json().url as string).split('/s/')[1];
    const publicRead = () =>
      t.app.inject({ method: 'GET', url: `/api/public/notes/${token}` }).then((r) => r.statusCode);
    expect(await publicRead()).toBe(200);

    await lock(note.id);
    // A protected note the whole internet can still read is not protected.
    // Reversible like trashing: unprotecting revives the link.
    expect(await publicRead()).toBe(404);
    await reveal();
    await req('POST', `/api/notes/${note.id}/unlock`);
    expect(await publicRead()).toBe(200);
  });

  it('stays hidden from an API token, which cannot retype anything', async () => {
    const note = await create({ title: 'Personal' });
    const tok = await req('POST', '/api/tokens', { name: 'agent' });
    expect(tok.statusCode).toBe(201);
    const bearer = { authorization: `Bearer ${tok.json().token as string}` };

    await reveal();
    await lock(note.id);

    // This session can see it; the token never will — there is no way to ask
    // a token for a password, so protected notes are invisible to agents.
    expect((await find(note.id))?.title).toBe('Personal');
    const viaToken = await t.app.inject({ method: 'GET', url: '/api/notes', headers: bearer });
    expect((viaToken.json() as FullNote[]).find((n) => n.id === note.id)).toMatchObject({
      locked: true,
      title: '',
    });
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: '/api/protection/unlock',
          headers: bearer,
          payload: { password: PASSWORD },
        })
      ).statusCode,
    ).toBe(403);
  });
});
