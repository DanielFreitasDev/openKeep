import type { AdminOverview, AdminUserPage, FullNote, InstanceMeta } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

const BOSS = 'boss@example.com';
const PLAIN = 'plain@example.com';

describe('admin', () => {
  let t: TestApp;
  let boss: string;
  let plain: string;

  beforeAll(async () => {
    t = await createTestApp({ ADMIN_EMAILS: ` ${BOSS.toUpperCase()} , ` });
    boss = await t.signUp(BOSS, 'Boss');
    plain = await t.signUp(PLAIN, 'Plain');
  });
  afterAll(async () => {
    await t.close();
  });

  const get = (url: string, as: string) =>
    t.app.inject({ method: 'GET', url, headers: { cookie: as } });

  it('tells each account whether it administers the instance', async () => {
    // The env is matched case-insensitively and survives sloppy spacing.
    expect((await get('/api/admin/me', boss)).json()).toEqual({ admin: true });
    expect((await get('/api/admin/me', plain)).json()).toEqual({ admin: false });
  });

  it('keeps every other admin route to admins, and out of PAT reach', async () => {
    expect((await get('/api/admin/users', plain)).statusCode).toBe(403);
    expect((await get('/api/admin/overview', plain)).statusCode).toBe(403);
    expect((await t.app.inject({ method: 'GET', url: '/api/admin/users' })).statusCode).toBe(401);

    const token = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie: boss },
      payload: { name: 'agent' },
    });
    expect(token.statusCode).toBe(201);
    const { token: secret } = token.json() as { token: string };
    const asPat = await t.app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(asPat.statusCode).toBe(403);
  });

  it('reports what each account costs the instance', async () => {
    const note = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: plain },
      payload: { title: 'Mine' },
    });
    expect(note.statusCode).toBe(201);
    await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: plain },
      payload: { name: 'work' },
    });

    const page = (await get('/api/admin/users', boss)).json() as AdminUserPage;
    const row = page.users.find((u) => u.email === PLAIN);
    expect(row).toBeDefined();
    expect(row?.admin).toBe(false);
    expect(row?.notes).toBe(1);
    expect(row?.labels).toBe(1);
    expect(row?.storageBytes).toBe(0);
    expect(page.users.find((u) => u.email === BOSS)?.admin).toBe(true);

    const overview = (await get('/api/admin/overview', boss)).json() as AdminOverview;
    expect(overview.totals.users).toBe(2);
    expect(overview.totals.notes).toBe(1);
    expect(overview.signupEnabled).toBe(true);
  });

  it('answers with a page and a total, searchable by name or email', async () => {
    const all = (await get('/api/admin/users', boss)).json() as AdminUserPage;
    expect(all.total).toBe(all.users.length);

    const byEmail = (await get('/api/admin/users?q=PLAIN@exam', boss)).json() as AdminUserPage;
    expect(byEmail.users.map((u) => u.email)).toEqual([PLAIN]);
    expect(byEmail.total).toBe(1);

    const byName = (await get('/api/admin/users?q=oss', boss)).json() as AdminUserPage;
    expect(byName.users.map((u) => u.email)).toEqual([BOSS]);

    // `total` counts the matches, not the page: a limit narrows one, not both.
    const limited = (await get('/api/admin/users?limit=1', boss)).json() as AdminUserPage;
    expect(limited.users).toHaveLength(1);
    expect(limited.total).toBe(all.total);

    expect((await get('/api/admin/users?q=nobody-here', boss)).json()).toEqual({
      users: [],
      total: 0,
    });
  });

  it('closes public sign-up at the one place an account is born', async () => {
    const patch = await t.app.inject({
      method: 'PATCH',
      url: '/api/admin/instance',
      headers: { cookie: boss },
      payload: { signupEnabled: false },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as AdminOverview).signupEnabled).toBe(false);

    // The login page stops offering the form because meta says so.
    const meta = (await t.app.inject({ method: 'GET', url: '/api/meta' })).json() as InstanceMeta;
    expect(meta.signupEnabled).toBe(false);

    const closed = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: 'late@example.com', password: 'password-123', name: 'Late' },
    });
    expect(closed.statusCode).toBe(403);

    // Signing IN still works — closed means no new accounts, not a locked door.
    const signIn = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: PLAIN, password: 'password-123' },
    });
    expect(signIn.statusCode).toBe(200);

    const reopen = await t.app.inject({
      method: 'PATCH',
      url: '/api/admin/instance',
      headers: { cookie: boss },
      payload: { signupEnabled: true },
    });
    expect((reopen.json() as AdminOverview).signupEnabled).toBe(true);
  });

  it('deletes an account with everything hanging off it', async () => {
    const victim = await t.signUp('victim@example.com', 'Victim');
    const note = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: victim },
      payload: { title: 'Goes with me' },
    });
    const { id: noteId } = note.json() as FullNote;
    const { users } = (await get('/api/admin/users', boss)).json() as AdminUserPage;
    const target = users.find((u) => u.email === 'victim@example.com');
    expect(target).toBeDefined();

    const purge = (payload: Record<string, unknown>) =>
      t.app.inject({
        method: 'POST',
        url: `/api/admin/users/${target?.id}/delete`,
        headers: { cookie: boss },
        payload,
      });

    expect((await purge({})).statusCode).toBe(400);
    expect((await purge({ confirm: 'yes' })).statusCode).toBe(400);

    const done = await purge({ confirm: 'delete-user' });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ notes: 1 });

    // Their session row cascaded away, but Better Auth answers from the signed
    // session cookie for up to 5 minutes (cookieCache), so the browser that was
    // open when the account went is not logged out on the spot — it is looking
    // at an account with nothing left in it.
    expect((await get('/api/notes', victim)).json()).toEqual([]);
    expect((await get(`/api/notes/${noteId}`, victim)).statusCode).toBe(404);
    expect((await get(`/api/notes/${noteId}`, boss)).statusCode).toBe(404);
    const after = (await get('/api/admin/users', boss)).json() as AdminUserPage;
    expect(after.users.some((u) => u.email === 'victim@example.com')).toBe(false);
  });

  it('refuses to delete an account the env still calls an admin', async () => {
    const { users } = (await get('/api/admin/users', boss)).json() as AdminUserPage;
    const self = users.find((u) => u.email === BOSS);
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/admin/users/${self?.id}/delete`,
      headers: { cookie: boss },
      payload: { confirm: 'delete-user' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('has no panel at all when ADMIN_EMAILS is unset', async () => {
    const open = await createTestApp();
    try {
      const cookie = await open.signUp('nobody@example.com', 'Nobody');
      expect(
        (
          await open.app.inject({ method: 'GET', url: '/api/admin/me', headers: { cookie } })
        ).json(),
      ).toEqual({ admin: false });
      expect(
        (await open.app.inject({ method: 'GET', url: '/api/admin/users', headers: { cookie } }))
          .statusCode,
      ).toBe(403);
    } finally {
      await open.close();
    }
  });

  it('lets an admin address sign up on an instance that is already closed', async () => {
    const closed = await createTestApp({
      ADMIN_EMAILS: 'owner@example.com,second@example.com',
    });
    try {
      const first = await closed.signUp('owner@example.com', 'Owner');
      await closed.app.inject({
        method: 'PATCH',
        url: '/api/admin/instance',
        headers: { cookie: first },
        payload: { signupEnabled: false },
      });
      // A stranger is turned away; the second owner still gets in, so closing
      // sign-up before creating your own account is not a lockout.
      const stranger = await closed.app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: { email: 'stranger@example.com', password: 'password-123', name: 'S' },
      });
      expect(stranger.statusCode).toBe(403);
      const secondAdmin = await closed.app.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: { email: 'second@example.com', password: 'password-123', name: 'Second' },
      });
      expect(secondAdmin.statusCode).toBe(200);
    } finally {
      await closed.close();
    }
  });
});
