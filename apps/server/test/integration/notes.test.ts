import type { FullNote } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noteMembers, notes } from '../../src/db/schema/notes.js';
import { purgeExpiredTrash } from '../../src/modules/notes/service.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('notes core', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('owner@example.com', 'Owner');
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

  it('creates a note with sanitized content and top position', async () => {
    const a = await create({ title: 'First', bodyHtml: '<p>alpha</p>' });
    expect(a.title).toBe('First');
    expect(a.bodyHtml).toBe('<p>alpha</p>');
    expect(a.role).toBe('owner');
    expect(a.pinned).toBe(false);

    const b = await create({ title: 'Second', bodyHtml: '<p>beta <script>x</script>ok</p>' });
    expect(b.bodyHtml).not.toContain('script');

    // Newest first (smaller position sorts first).
    expect(b.position < a.position).toBe(true);
  });

  it('accepts a client-generated uuidv7 id and rejects duplicates', async () => {
    const id = '01890000-0000-7000-8000-00000000aaaa';
    const created = await create({ id, title: 'Client id' });
    expect(created.id).toBe(id);

    const dup = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { id, title: 'Dup' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('detects links from body text', async () => {
    const n = await create({ bodyHtml: '<p>see https://example.com</p>' });
    expect(n.hasLinks).toBe(true);
  });

  it('GET /api/notes/:id returns the full note to members only', async () => {
    const n = await create({ title: 'Single', bodyHtml: '<p>read me</p>' });

    const mine = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${n.id}`,
      headers: { cookie },
    });
    expect(mine.statusCode).toBe(200);
    expect((mine.json() as FullNote).title).toBe('Single');

    // Non-member: same 404 as a missing note (no existence oracle).
    const strangerCookie = await t.signUp('stranger@example.com', 'Stranger');
    const stranger = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${n.id}`,
      headers: { cookie: strangerCookie },
    });
    expect(stranger.statusCode).toBe(404);

    // Collaborator: 200 with their per-user state.
    const collabEmail = 'single-collab@example.com';
    const collabCookie = await t.signUp(collabEmail, 'Collab');
    const invite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${n.id}/collaborators`,
      headers: { cookie },
      payload: { email: collabEmail },
    });
    expect(invite.statusCode).toBe(201);
    const asCollab = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${n.id}`,
      headers: { cookie: collabCookie },
    });
    expect(asCollab.statusCode).toBe(200);
    expect((asCollab.json() as FullNote).role).toBe('collaborator');

    // Via PAT bearer auth.
    const tokenRes = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie },
      payload: { name: 'notes-single' },
    });
    expect(tokenRes.statusCode).toBe(201);
    const viaPat = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${n.id}`,
      headers: { authorization: `Bearer ${tokenRes.json().token}` },
    });
    expect(viaPat.statusCode).toBe(200);
    expect((viaPat.json() as FullNote).id).toBe(n.id);
  });

  it('patches content with LWW semantics and returns canonical html', async () => {
    const n = await create({ title: 'Patch me' });
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${n.id}`,
      headers: { cookie },
      payload: { bodyHtml: '<p onclick="x()">clean<div>ish</div></p>' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bodyHtml).not.toContain('onclick');
    expect(body.bodyHtml).not.toContain('div');
    expect(body.title).toBe('Patch me');
  });

  it('patches per-user state (pin, color, position)', async () => {
    const n = await create({ title: 'State' });
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${n.id}/state`,
      headers: { cookie },
      payload: { pinned: true, color: 'coral', position: 'zzz' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ pinned: true, color: 'coral', position: 'zzz' });
  });

  it('rejects invalid colors', async () => {
    const n = await create({});
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${n.id}/state`,
      headers: { cookie },
      payload: { color: 'magenta' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('validation_failed');
  });

  describe('trash lifecycle', () => {
    it('trash → read-only → restore → editable again', async () => {
      const n = await create({ title: 'Trash me', pinned: true });
      await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}/state`,
        headers: { cookie },
        payload: { pinned: true },
      });

      const trash = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${n.id}/trash`,
        headers: { cookie },
      });
      expect(trash.statusCode).toBe(200);
      const trashed = trash.json() as FullNote;
      expect(trashed.trashedAt).not.toBeNull();
      expect(trashed.pinned).toBe(false); // trashing unpins (Keep parity)

      const edit = await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}`,
        headers: { cookie },
        payload: { title: 'nope' },
      });
      expect(edit.statusCode).toBe(409);
      expect(edit.json().code).toBe('note_trashed');

      const stateEdit = await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}/state`,
        headers: { cookie },
        payload: { color: 'mint' },
      });
      expect(stateEdit.statusCode).toBe(409);

      const restore = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${n.id}/restore`,
        headers: { cookie },
      });
      expect(restore.statusCode).toBe(200);
      expect((restore.json() as FullNote).trashedAt).toBeNull();

      const edit2 = await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}`,
        headers: { cookie },
        payload: { title: 'yes' },
      });
      expect(edit2.statusCode).toBe(200);
    });

    it('delete forever requires the note to be trashed first', async () => {
      const n = await create({ title: 'Delete me' });
      const early = await t.app.inject({
        method: 'DELETE',
        url: `/api/notes/${n.id}`,
        headers: { cookie },
      });
      expect(early.statusCode).toBe(409);

      await t.app.inject({ method: 'POST', url: `/api/notes/${n.id}/trash`, headers: { cookie } });
      const del = await t.app.inject({
        method: 'DELETE',
        url: `/api/notes/${n.id}`,
        headers: { cookie },
      });
      expect(del.statusCode).toBe(204);

      const gone = await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}`,
        headers: { cookie },
        payload: { title: 'x' },
      });
      expect(gone.statusCode).toBe(404);
    });

    it('empty trash deletes only my trashed notes', async () => {
      const keep = await create({ title: 'Keep' });
      const toss = await create({ title: 'Toss' });
      await t.app.inject({
        method: 'POST',
        url: `/api/notes/${toss.id}/trash`,
        headers: { cookie },
      });

      const res = await t.app.inject({
        method: 'POST',
        url: '/api/notes/trash/empty',
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().deleted).toBeGreaterThanOrEqual(1);

      const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
      const ids = (list.json() as FullNote[]).map((x) => x.id);
      expect(ids).toContain(keep.id);
      expect(ids).not.toContain(toss.id);
    });

    it('purge job hard-deletes notes older than 7 days in trash', async () => {
      const n = await create({ title: 'Old trash' });
      await t.app.inject({ method: 'POST', url: `/api/notes/${n.id}/trash`, headers: { cookie } });
      const eightDaysHence = new Date(Date.now() + 8 * 24 * 3600 * 1000);
      const purged = await purgeExpiredTrash(t.db, eightDaysHence);
      expect(purged).toBeGreaterThanOrEqual(1);
      const row = await t.db.select().from(notes).where(eq(notes.id, n.id));
      expect(row).toHaveLength(0);
    });
  });

  describe('copy & convert', () => {
    it('copy clones content/color, resets pin, owner is the caller', async () => {
      const n = await create({ title: 'Original', bodyHtml: '<p>body</p>' });
      await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}/state`,
        headers: { cookie },
        payload: { pinned: true, color: 'sage' },
      });

      const res = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${n.id}/copy`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(201);
      const copy = res.json() as FullNote;
      expect(copy.id).not.toBe(n.id);
      expect(copy.title).toBe('Original');
      expect(copy.color).toBe('sage');
      expect(copy.pinned).toBe(false);
      expect(copy.role).toBe('owner');
    });

    it('converts text → list (lines become items) and back (checks dropped)', async () => {
      const n = await create({ title: 'Groceries', bodyHtml: '<p>milk</p><p>bread</p><p></p>' });

      const toList = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${n.id}/convert`,
        headers: { cookie },
        payload: { to: 'list' },
      });
      expect(toList.statusCode).toBe(200);
      const list = toList.json() as FullNote;
      expect(list.type).toBe('list');
      expect(list.items.map((i) => i.text)).toEqual(['milk', 'bread']);
      expect(list.bodyHtml).toBe('');

      const toText = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${n.id}/convert`,
        headers: { cookie },
        payload: { to: 'text' },
      });
      const text = toText.json() as FullNote;
      expect(text.type).toBe('text');
      expect(text.items).toHaveLength(0);
      expect(text.bodyHtml).toBe('<p>milk</p><p>bread</p>');
    });
  });

  describe('versions', () => {
    it('captures a session-boundary snapshot and restores it', async () => {
      const n = await create({ title: 'V1', bodyHtml: '<p>first</p>' });

      // Age the note so the next edit crosses the session boundary.
      await t.db
        .update(notes)
        .set({ updatedAt: new Date(Date.now() - 11 * 60 * 1000) })
        .where(eq(notes.id, n.id));

      await t.app.inject({
        method: 'PATCH',
        url: `/api/notes/${n.id}`,
        headers: { cookie },
        payload: { title: 'V2', bodyHtml: '<p>second</p>' },
      });

      const versions = await t.app.inject({
        method: 'GET',
        url: `/api/notes/${n.id}/versions`,
        headers: { cookie },
      });
      expect(versions.statusCode).toBe(200);
      const metas = versions.json();
      expect(metas.length).toBe(1);

      const download = await t.app.inject({
        method: 'GET',
        url: `/api/notes/${n.id}/versions/${metas[0].id}/download`,
        headers: { cookie },
      });
      expect(download.statusCode).toBe(200);
      expect(download.headers['content-type']).toContain('text/plain');
      expect(download.body).toContain('V1');
      expect(download.body).toContain('first');

      const restore = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${n.id}/versions/${metas[0].id}/restore`,
        headers: { cookie },
      });
      expect(restore.statusCode).toBe(200);
      const restored = restore.json() as FullNote;
      expect(restored.title).toBe('V1');
      expect(restored.bodyHtml).toContain('first');

      // Restoring snapshotted the pre-restore state too.
      const after = await t.app.inject({
        method: 'GET',
        url: `/api/notes/${n.id}/versions`,
        headers: { cookie },
      });
      expect(after.json().length).toBe(2);
    });
  });
});

describe('notes authz matrix', () => {
  let t: TestApp;
  let ownerCookie: string;
  let collabCookie: string;
  let strangerCookie: string;
  let noteId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ownerCookie = await t.signUp('o@example.com', 'O');
    collabCookie = await t.signUp('c@example.com', 'C');
    strangerCookie = await t.signUp('s@example.com', 'S');

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: ownerCookie },
      payload: { title: 'Shared note', bodyHtml: '<p>content</p>' },
    });
    noteId = (res.json() as FullNote).id;

    // Sharing API arrives in M7; create the collaborator membership directly.
    const collabSession = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: collabCookie },
    });
    const collabId = collabSession.json().user.id as string;
    await t.db.insert(noteMembers).values({
      noteId,
      userId: collabId,
      role: 'collaborator',
      position: 'a0',
    });
  });
  afterAll(async () => {
    await t.close();
  });

  interface Case {
    op: string;
    request: (cookie: string) => {
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      url: string;
      payload?: unknown;
    };
    owner: number;
    collaborator: number;
    stranger: number;
  }

  const CASES: Case[] = [
    {
      op: 'patch content',
      request: () => ({ method: 'PATCH', url: `/api/notes/@id`, payload: { title: 'x' } }),
      owner: 200,
      collaborator: 200,
      stranger: 404,
    },
    {
      op: 'patch state',
      request: () => ({ method: 'PATCH', url: `/api/notes/@id/state`, payload: { color: 'mint' } }),
      owner: 200,
      collaborator: 200,
      stranger: 404,
    },
    {
      op: 'copy',
      request: () => ({ method: 'POST', url: `/api/notes/@id/copy` }),
      owner: 201,
      collaborator: 201,
      stranger: 404,
    },
    {
      op: 'convert',
      request: () => ({ method: 'POST', url: `/api/notes/@id/convert`, payload: { to: 'text' } }),
      owner: 200,
      collaborator: 200,
      stranger: 404,
    },
    {
      op: 'list versions',
      request: () => ({ method: 'GET', url: `/api/notes/@id/versions` }),
      owner: 200,
      collaborator: 200,
      stranger: 404,
    },
    {
      op: 'trash',
      request: () => ({ method: 'POST', url: `/api/notes/@id/trash` }),
      owner: 200,
      collaborator: 403,
      stranger: 404,
    },
    {
      op: 'restore',
      request: () => ({ method: 'POST', url: `/api/notes/@id/restore` }),
      owner: 200,
      collaborator: 403,
      stranger: 404,
    },
    {
      op: 'delete forever',
      request: () => ({ method: 'DELETE', url: `/api/notes/@id` }),
      owner: 409, // not trashed at assertion time — authz passes, precondition fails
      collaborator: 403,
      stranger: 404,
    },
  ];

  for (const c of CASES) {
    it(`${c.op}: owner=${c.owner} collaborator=${c.collaborator} stranger=${c.stranger}`, async () => {
      for (const [who, cookie, expected] of [
        ['stranger', strangerCookie, c.stranger],
        ['collaborator', collabCookie, c.collaborator],
        ['owner', ownerCookie, c.owner],
      ] as const) {
        const req = c.request(cookie);
        const res = await t.app.inject({
          method: req.method,
          url: req.url.replace('@id', noteId),
          headers: { cookie },
          ...(req.payload !== undefined ? { payload: req.payload as Record<string, unknown> } : {}),
        });
        expect(res.statusCode, `${c.op} as ${who}`).toBe(expected);
        // Restore state mutated by owner-level ops so later cases see a live note.
        if (who === 'owner' && c.op === 'trash') {
          await t.app.inject({
            method: 'POST',
            url: `/api/notes/${noteId}/restore`,
            headers: { cookie: ownerCookie },
          });
        }
      }
    });
  }

  it('collaborator state changes are isolated per user', async () => {
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/state`,
      headers: { cookie: collabCookie },
      payload: { color: 'coral', pinned: true },
    });
    const ownerList = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { cookie: ownerCookie },
    });
    const ownerNote = (ownerList.json() as FullNote[]).find((n) => n.id === noteId);
    expect(ownerNote?.color).toBe('mint'); // owner's own color from the matrix run
    expect(ownerNote?.pinned).toBe(false);
  });
});
