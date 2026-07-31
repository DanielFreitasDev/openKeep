import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

/**
 * View-only sharing. The whole feature is the third level in
 * `assertNoteAccess`, so the test that matters is the matrix: which routes a
 * viewer bounces off (shared content) and which ones stay open (their own
 * per-user state, which the model gives every member).
 */
describe('view-only collaborators', () => {
  let t: TestApp;
  let ownerCookie: string;
  let viewerCookie: string;
  let viewerId: string;
  let ownerId: string;
  const viewerEmail = 'viewer@example.com';
  let noteId: string;
  let itemId: string;

  const idOf = async (cookie: string) => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    t = await createTestApp();
    ownerCookie = await t.signUp('viewer-owner@example.com', 'Owner');
    viewerCookie = await t.signUp(viewerEmail, 'Viewer');
    ownerId = await idOf(ownerCookie);
    viewerId = await idOf(viewerCookie);

    const created = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: ownerCookie },
      payload: { type: 'list', title: 'Groceries', items: [{ text: 'Milk' }] },
    });
    const note = created.json() as FullNote;
    noteId = note.id;
    itemId = note.items[0]!.id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('invites at view-only and the note arrives with role=viewer', async () => {
    const invite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie: ownerCookie },
      payload: { email: viewerEmail, role: 'viewer' },
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json().role).toBe('viewer');

    const got = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}`,
      headers: { cookie: viewerCookie },
    });
    expect(got.statusCode).toBe(200);
    const note = got.json() as FullNote;
    expect(note.role).toBe('viewer');
    expect(note.title).toBe('Groceries');
  });

  it('blocks every write to the shared content with 403 note_read_only', async () => {
    const attempts: [string, string, Record<string, unknown> | undefined][] = [
      ['PATCH', `/api/notes/${noteId}`, { title: 'Hijacked' }],
      ['POST', `/api/notes/${noteId}/items`, { text: 'Sneaked in' }],
      ['PATCH', `/api/notes/${noteId}/items/${itemId}`, { checked: true }],
      ['DELETE', `/api/notes/${noteId}/items/${itemId}`, undefined],
      ['POST', `/api/notes/${noteId}/uncheck-all`, undefined],
      ['POST', `/api/notes/${noteId}/delete-checked`, undefined],
      ['POST', `/api/notes/${noteId}/convert`, { to: 'text' }],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await t.app.inject({
        method: method as 'PATCH',
        url,
        headers: { cookie: viewerCookie },
        ...(payload ? { payload } : {}),
      });
      expect({ url, status: res.statusCode }).toEqual({ url, status: 403 });
      expect(res.json().code).toBe('note_read_only');
    }

    // The note is untouched for everyone else.
    const owned = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}`,
      headers: { cookie: ownerCookie },
    });
    const note = owned.json() as FullNote;
    expect(note.title).toBe('Groceries');
    expect(note.items).toHaveLength(1);
    expect(note.items[0]!.checked).toBe(false);
  });

  it('blocks the note-level owner actions with plain 403', async () => {
    for (const url of [`/api/notes/${noteId}/trash`, `/api/notes/${noteId}/restore`]) {
      const res = await t.app.inject({ method: 'POST', url, headers: { cookie: viewerCookie } });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('forbidden');
    }
  });

  it('keeps the per-user half open: pin, colour, labels, reminder, copy', async () => {
    const state = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/state`,
      headers: { cookie: viewerCookie },
      payload: { pinned: true, color: 'coral' },
    });
    expect(state.statusCode).toBe(200);

    const label = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: viewerCookie },
      payload: { name: 'to read' },
    });
    const attach = await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/labels/${label.json().id}`,
      headers: { cookie: viewerCookie },
    });
    expect(attach.statusCode).toBe(204);

    const reminder = await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/reminder`,
      headers: { cookie: viewerCookie },
      payload: {
        remindAt: new Date(Date.now() + 3600_000).toISOString(),
        timezone: 'America/Fortaleza',
      },
    });
    expect(reminder.statusCode).toBe(200);

    // Copying reads the source and writes a brand-new note that is mine.
    const copy = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/copy`,
      headers: { cookie: viewerCookie },
    });
    expect(copy.statusCode).toBe(201);
    expect((copy.json() as FullNote).role).toBe('owner');

    // None of it leaked onto the owner's copy of the same note.
    const owned = (
      await t.app.inject({
        method: 'GET',
        url: `/api/notes/${noteId}`,
        headers: { cookie: ownerCookie },
      })
    ).json() as FullNote;
    expect(owned.pinned).toBe(false);
    expect(owned.color).toBe('default');
    expect(owned.reminder).toBeNull();
  });

  it('reads the version history but cannot restore it', async () => {
    // Give the note a version by editing it as the owner twice.
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      headers: { cookie: ownerCookie },
      payload: { title: 'Groceries v2' },
    });

    const list = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/versions`,
      headers: { cookie: viewerCookie },
    });
    expect(list.statusCode).toBe(200);
    const versions = list.json() as { id: string }[];
    if (versions.length > 0) {
      const restore = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${noteId}/versions/${versions[0]!.id}/restore`,
        headers: { cookie: viewerCookie },
      });
      expect(restore.statusCode).toBe(403);
      expect(restore.json().code).toBe('note_read_only');
    }
  });

  it('only the owner changes permissions, and never their own', async () => {
    const byViewer = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/collaborators/${viewerId}`,
      headers: { cookie: viewerCookie },
      payload: { role: 'collaborator' },
    });
    expect(byViewer.statusCode).toBe(403);

    const ownSelf = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/collaborators/${ownerId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'viewer' },
    });
    expect(ownSelf.statusCode).toBe(400);

    const stranger = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/collaborators/${crypto.randomUUID()}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'viewer' },
    });
    expect(stranger.statusCode).toBe(404);
  });

  it('promoting to editor opens the content up, demoting closes it again', async () => {
    const promote = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/collaborators/${viewerId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'collaborator' },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().role).toBe('collaborator');

    const edit = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      headers: { cookie: viewerCookie },
      payload: { title: 'Now editable' },
    });
    expect(edit.statusCode).toBe(200);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/collaborators/${viewerId}`,
      headers: { cookie: ownerCookie },
      payload: { role: 'viewer' },
    });
    const again = await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      headers: { cookie: viewerCookie },
      payload: { title: 'Nope' },
    });
    expect(again.statusCode).toBe(403);
  });

  it('a viewer can still leave the note', async () => {
    const leave = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}/collaborators/${viewerId}`,
      headers: { cookie: viewerCookie },
    });
    expect(leave.statusCode).toBe(204);

    const gone = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}`,
      headers: { cookie: viewerCookie },
    });
    expect(gone.statusCode).toBe(404);
  });
});
