import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('delete all notes', () => {
  let t: TestApp;
  let mine: string;
  let theirs: string;

  beforeAll(async () => {
    t = await createTestApp();
    mine = await t.signUp('owner-purge@example.com', 'Owner');
    theirs = await t.signUp('friend-purge@example.com', 'Friend');
  });
  afterAll(async () => {
    await t.close();
  });

  const create = async (title: string, as = mine) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: as },
      payload: { title },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  const list = async (as = mine, view = 'active') => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/notes?view=${view}`,
      headers: { cookie: as },
    });
    return res.json() as FullNote[];
  };

  const deleteAll = (
    as = mine,
    payload: Record<string, unknown> = { confirm: 'delete-all-notes' },
  ) =>
    t.app.inject({
      method: 'POST',
      url: '/api/notes/delete-all',
      headers: { cookie: as },
      payload,
    });

  it('refuses without the literal confirmation in the body', async () => {
    await create('Still here');
    expect((await deleteAll(mine, {})).statusCode).toBe(400);
    expect((await deleteAll(mine, { confirm: true })).statusCode).toBe(400);
    expect((await deleteAll(mine, { confirm: 'yes' })).statusCode).toBe(400);
    expect(await list()).toHaveLength(1);
  });

  it('needs a session', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes/delete-all',
      payload: { confirm: 'delete-all-notes' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('deletes owned notes forever, leaves shared ones, and takes my labels with them', async () => {
    const label = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: mine },
      payload: { name: 'gone-too' },
    });
    expect(label.statusCode).toBe(201);

    // The friend's own label must survive: labels are per-user.
    const friendLabel = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: theirs },
      payload: { name: 'friend-label' },
    });
    expect(friendLabel.statusCode).toBe(201);

    const archived = await create('Archived one');
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${archived.id}/state`,
      headers: { cookie: mine },
      payload: { archived: true },
    });
    const trashed = await create('Trashed one');
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${trashed.id}/trash`,
      headers: { cookie: mine },
    });

    // A note owned by the friend and shared with me must survive.
    const friendNote = await create('Friend note', theirs);
    const invite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${friendNote.id}/collaborators`,
      headers: { cookie: theirs },
      payload: { email: 'owner-purge@example.com' },
    });
    expect(invite.statusCode).toBe(201);
    expect((await list()).some((n) => n.id === friendNote.id)).toBe(true);

    const res = await deleteAll();
    expect(res.statusCode).toBe(200);
    const body = res.json() as { deleted: number; left: number; labels: number };
    // Everything I own, whatever view it was in: active, archived and trashed.
    expect(body.deleted).toBeGreaterThanOrEqual(3);
    expect(body.left).toBe(1);
    expect(body.labels).toBe(1);

    expect(await list()).toHaveLength(0);
    expect(await list(mine, 'archived')).toHaveLength(0);
    expect(await list(mine, 'trash')).toHaveLength(0);

    // The friend still has their note, minus one collaborator.
    const friendSide = await list(theirs);
    expect(friendSide.map((n) => n.id)).toContain(friendNote.id);
    expect(friendSide.find((n) => n.id === friendNote.id)?.collaborators).toHaveLength(1);

    // My labels went with my notes; the friend's own list is untouched.
    const labels = await t.app.inject({
      method: 'GET',
      url: '/api/labels',
      headers: { cookie: mine },
    });
    expect(labels.json()).toEqual([]);
    const friendLabels = await t.app.inject({
      method: 'GET',
      url: '/api/labels',
      headers: { cookie: theirs },
    });
    expect((friendLabels.json() as { name: string }[]).map((l) => l.name)).toContain(
      'friend-label',
    );
  });

  // Its own app: the calls above already spend the 5/min budget, which is the
  // rate limit doing its job.
  it('is a no-op on an empty account', async () => {
    const fresh = await createTestApp();
    try {
      const cookie = await fresh.signUp('empty-purge@example.com', 'Empty');
      const res = await fresh.app.inject({
        method: 'POST',
        url: '/api/notes/delete-all',
        headers: { cookie },
        payload: { confirm: 'delete-all-notes' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ deleted: 0, left: 0, labels: 0 });
    } finally {
      await fresh.close();
    }
  });
});
