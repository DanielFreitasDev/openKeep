import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('auth & settings', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('serves health and readiness', async () => {
    const health = await t.app.inject({ method: 'GET', url: '/api/healthz' });
    expect(health.statusCode).toBe(200);
    const ready = await t.app.inject({ method: 'GET', url: '/api/readyz' });
    expect(ready.statusCode).toBe(200);
  });

  it('returns problem+json for unknown routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json().code).toBe('not_found');
  });

  it('signs up, establishes a session, and seeds default settings', async () => {
    const cookie = await t.signUp('alice@example.com', 'Alice');

    const session = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe('alice@example.com');

    const settings = await t.app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { cookie },
    });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toEqual({
      addItemsToBottom: true,
      moveCheckedToBottom: true,
      richLinkPreviews: true,
      sharingEnabled: true,
      reminderMorning: '08:00',
      reminderAfternoon: '13:00',
      reminderEvening: '18:00',
      timezone: null,
      viewMode: 'grid',
      noteSort: 'manual',
      savedSearches: [],
    });
  });

  it('signs in with email/password', async () => {
    await t.signUp('bob@example.com', 'Bob', 'hunter2-hunter2');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: 'bob@example.com', password: 'hunter2-hunter2' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.length).toBeGreaterThan(0);
  });

  it('patches settings and persists them', async () => {
    const cookie = await t.signUp('carol@example.com', 'Carol');
    const patch = await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: {
        viewMode: 'list',
        reminderMorning: '07:30',
        sharingEnabled: false,
        noteSort: 'title',
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().viewMode).toBe('list');

    const read = await t.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
    expect(read.json()).toMatchObject({
      viewMode: 'list',
      reminderMorning: '07:30',
      sharingEnabled: false,
      noteSort: 'title',
    });
  });

  it('rejects invalid settings payloads with problem details', async () => {
    const cookie = await t.signUp('dave@example.com', 'Dave');
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { reminderMorning: '25:99' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('validation_failed');
    expect(body.errors[0].path).toContain('reminderMorning');
  });

  it('rejects a note sort outside the enum before it reaches the check constraint', async () => {
    const cookie = await t.signUp('erin@example.com', 'Erin');
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { noteSort: 'by-vibes' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_failed');
  });

  // One account for the three of them: sign-ups are rate limited at 10/min/IP,
  // and this file already spends most of that budget.
  describe('saved searches', () => {
    let cookie: string;
    beforeAll(async () => {
      cookie = await t.signUp('frank@example.com', 'Frank');
    });

    it('stores them and hands them back whole', async () => {
      const savedSearches = [
        { id: 'aaa', name: 'Market', q: 'milk has:list label:market' },
        { id: 'bbb', name: 'With Ana', q: 'is:pinned', collaborator: 'user-1' },
      ];
      const patch = await t.app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { savedSearches },
      });
      expect(patch.statusCode).toBe(200);
      expect(patch.json().savedSearches).toEqual(savedSearches);

      const read = await t.app.inject({ method: 'GET', url: '/api/settings', headers: { cookie } });
      expect(read.json().savedSearches).toEqual(savedSearches);

      // The list is written whole, so removal is an assignment, not a delete.
      const removed = await t.app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { savedSearches: [savedSearches[0]] },
      });
      expect(removed.json().savedSearches).toHaveLength(1);
    });

    it('rejects one without a name', async () => {
      const res = await t.app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: { savedSearches: [{ id: 'aaa', name: '  ', q: 'milk' }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('validation_failed');
    });

    it('caps how many an account can keep', async () => {
      const res = await t.app.inject({
        method: 'PATCH',
        url: '/api/settings',
        headers: { cookie },
        payload: {
          savedSearches: Array.from({ length: 21 }, (_, i) => ({
            id: `id-${i}`,
            name: `Search ${i}`,
            q: `term${i}`,
          })),
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('validation_failed');
    });
  });

  it('requires auth for settings', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('unauthorized');
  });

  it('rejects cross-site mutations by Origin header', async () => {
    const cookie = await t.signUp('eve@example.com', 'Eve');
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie, origin: 'https://evil.example' },
      payload: { viewMode: 'list' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects cross-site mutations by Sec-Fetch-Site', async () => {
    const cookie = await t.signUp('mallory@example.com', 'Mallory');
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie, 'sec-fetch-site': 'cross-site' },
      payload: { viewMode: 'list' },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('auth rate limiting', () => {
  it('limits credential POSTs to 10/min/IP', async () => {
    const t = await createTestApp();
    try {
      let last = 0;
      for (let i = 0; i < 11; i++) {
        const res = await t.app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          payload: { email: 'nobody@example.com', password: 'wrong-password' },
        });
        last = res.statusCode;
      }
      expect(last).toBe(429);
    } finally {
      await t.close();
    }
  });
});
