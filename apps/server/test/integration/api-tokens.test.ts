import type { ApiTokenWithSecret, FullNote } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiTokens } from '../../src/db/schema/api-tokens.js';
import { user } from '../../src/db/schema/auth.js';
import { generateToken } from '../../src/lib/tokens.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('api tokens (PAT)', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('pat-owner@example.com', 'Pat Owner');
  });
  afterAll(async () => {
    await t.close();
  });

  const createToken = async (name: string, expiresInDays?: number) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie },
      payload: { name, ...(expiresInDays ? { expiresInDays } : {}) },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as ApiTokenWithSecret;
  };

  it('creates a token and returns the okp_ secret exactly once', async () => {
    const created = await createToken('Claude Code', 90);
    expect(created.token).toMatch(/^okp_[A-Za-z0-9_-]{43}$/);
    expect(created.tokenPrefix).toBe(created.token.slice(0, 12));
    expect(created.expiresAt).not.toBeNull();

    const list = await t.app.inject({ method: 'GET', url: '/api/tokens', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const rows = list.json() as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.token).toBeUndefined();
      expect(row.tokenPrefix).toMatch(/^okp_/);
    }
  });

  it('authenticates REST requests via Bearer PAT and stamps lastUsedAt', async () => {
    const { token, id } = await createToken('REST access');
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await t.db.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(row?.lastUsedAt).not.toBeNull();
  });

  it('scopes PAT access to the owning user', async () => {
    const otherCookie = await t.signUp('pat-other@example.com', 'Other');
    const note = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: otherCookie },
      payload: { title: 'Not yours' },
    });
    expect(note.statusCode).toBe(201);
    const otherNoteId = (note.json() as FullNote).id;

    const { token } = await createToken('Scoped');
    const list = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { authorization: `Bearer ${token}` },
    });
    const ids = (list.json() as FullNote[]).map((n) => n.id);
    expect(ids).not.toContain(otherNoteId);

    const single = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${otherNoteId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(single.statusCode).toBe(404);
  });

  it('rejects invalid, expired and revoked tokens with 401', async () => {
    const bogus = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { authorization: 'Bearer okp_definitely-not-a-real-token-aaaaaaaaaaaaa' },
    });
    expect(bogus.statusCode).toBe(401);
    expect(bogus.json().code).toBe('unauthorized');

    const expired = await createToken('Expired', 1);
    await t.db
      .update(apiTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiTokens.id, expired.id));
    const expiredRes = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { authorization: `Bearer ${expired.token}` },
    });
    expect(expiredRes.statusCode).toBe(401);

    const revoked = await createToken('Revoked');
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${revoked.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    const revokedRes = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { authorization: `Bearer ${revoked.token}` },
    });
    expect(revokedRes.statusCode).toBe(401);
  });

  it('refuses token management via PAT (403)', async () => {
    const { token } = await createToken('No self-mgmt');
    const bearer = { authorization: `Bearer ${token}` };

    const list = await t.app.inject({ method: 'GET', url: '/api/tokens', headers: bearer });
    expect(list.statusCode).toBe(403);

    const create = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: bearer,
      payload: { name: 'Sneaky' },
    });
    expect(create.statusCode).toBe(403);
  });

  it('enforces the per-user token limit', async () => {
    // Seed 10 tokens directly (the POST route is rate-limited to 10/min/IP,
    // which would trip before the account limit in a loop of inject calls).
    const limitCookie = await t.signUp('pat-limit@example.com', 'Limit');
    const [u] = await t.db.select().from(user).where(eq(user.email, 'pat-limit@example.com'));
    await t.db.insert(apiTokens).values(
      Array.from({ length: 10 }, (_, i) => {
        const { hash, prefix } = generateToken();
        return { userId: u!.id, name: `Token ${i}`, tokenHash: hash, tokenPrefix: prefix };
      }),
    );

    const eleventh = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie: limitCookie },
      payload: { name: 'One too many' },
    });
    expect(eleventh.statusCode).toBe(400);
    expect(eleventh.json().code).toBe('token_limit_reached');
  });

  it('deleting an unknown token id returns 404', async () => {
    const res = await t.app.inject({
      method: 'DELETE',
      url: '/api/tokens/00000000-0000-7000-8000-000000000000',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });
});
