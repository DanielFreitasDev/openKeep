import type { AddressInfo } from 'node:net';
import { type FullNote, WS_PING, type WsEnvelope } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

interface WsClient {
  socket: WebSocket;
  events: WsEnvelope[];
  waitFor: (type: string, timeoutMs?: number) => Promise<WsEnvelope>;
  close: () => void;
}

async function connectWs(baseUrl: string, cookie: string): Promise<WsClient> {
  const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/api/ws`, {
    headers: { cookie },
  });
  const events: WsEnvelope[] = [];
  const waiters: { type: string; resolve: (e: WsEnvelope) => void }[] = [];

  socket.on('message', (data) => {
    const envelope = JSON.parse(String(data)) as WsEnvelope;
    events.push(envelope);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.type === envelope.type) {
        waiters[i]!.resolve(envelope);
        waiters.splice(i, 1);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
    socket.once('close', (code) => reject(new Error(`closed ${code}`)));
  });

  return {
    socket,
    events,
    waitFor: (type, timeoutMs = 2000) =>
      new Promise((resolve, reject) => {
        const existing = events.find((e) => e.type === type);
        if (existing) {
          resolve(existing);
          return;
        }
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
        waiters.push({
          type,
          resolve: (e) => {
            clearTimeout(timer);
            resolve(e);
          },
        });
      }),
    close: () => socket.close(),
  };
}

describe('sharing & realtime', () => {
  let t: TestApp;
  let baseUrl: string;
  let ownerCookie: string;
  let collabCookie: string;
  let collabEmail: string;
  let noteId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const address = t.app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    ownerCookie = await t.signUp('ws-owner@example.com', 'Owner');
    collabEmail = 'ws-collab@example.com';
    collabCookie = await t.signUp(collabEmail, 'Collab');

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: ownerCookie },
      payload: { title: 'Shared board', bodyHtml: '<p>hello</p>' },
    });
    noteId = (res.json() as FullNote).id;
  });
  afterAll(async () => {
    await t.close();
  });

  it('rejects unauthenticated and cross-origin upgrades', async () => {
    // The HTTP upgrade completes first; the app closes right after with a code.
    const closeCodeOf = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/api/ws`, { headers });
        const timer = setTimeout(() => reject(new Error('no close received')), 2000);
        ws.once('close', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        ws.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

    await expect(closeCodeOf({ cookie: 'nope=1' })).resolves.toBe(4401);
    await expect(
      closeCodeOf({ cookie: ownerCookie, origin: 'https://evil.example' }),
    ).resolves.toBe(4403);
  });

  // Browsers never hand protocol pong frames to JS, so the client heartbeat
  // rides on an application message the server has to answer.
  it('answers the client heartbeat and ignores anything else', async () => {
    const ws = await connectWs(baseUrl, ownerCookie);

    // The listener is attached after the session lookup resolves, so keep
    // probing rather than racing the tail of the handshake.
    const probe = setInterval(() => ws.socket.send(WS_PING), 50);
    const pong = await ws.waitFor('pong').finally(() => clearInterval(probe));
    expect(pong.type).toBe('pong');

    ws.socket.send('{"type":"note.trashed","payload":{"id":"nope"}}');
    ws.socket.send('not json at all');
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.events.filter((e) => e.type !== 'pong')).toEqual([]);

    ws.close();
  });

  it('sharing flow: invite by email, collaborator sees the note', async () => {
    const collabWs = await connectWs(baseUrl, collabCookie);

    const invite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie: ownerCookie },
      payload: { email: collabEmail },
    });
    expect(invite.statusCode).toBe(201);

    // Collaborator devices receive the full note.
    const added = await collabWs.waitFor('note.added');
    expect((added.payload as { note: FullNote }).note.id).toBe(noteId);

    const list = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { cookie: collabCookie },
    });
    const theirNote = (list.json() as FullNote[]).find((n) => n.id === noteId);
    expect(theirNote?.role).toBe('collaborator');
    expect(theirNote?.collaborators).toHaveLength(2);

    collabWs.close();
  });

  it('sharing guards: unregistered 404, sharing disabled 403, dup 409', async () => {
    const missing = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie: ownerCookie },
      payload: { email: 'ghost@example.com' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('collaborator_not_registered');

    const dup = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie: ownerCookie },
      payload: { email: collabEmail },
    });
    expect(dup.statusCode).toBe(409);

    // Target disables sharing → new invites to them fail.
    const third = await t.signUp('ws-third@example.com', 'Third');
    await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie: third },
      payload: { sharingEnabled: false },
    });
    const blocked = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie: ownerCookie },
      payload: { email: 'ws-third@example.com' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('sharing_disabled_for_target');
  });

  it('content edits propagate to all members <1s; echoes carry origin', async () => {
    const ownerWs = await connectWs(baseUrl, ownerCookie); // owner's OTHER device
    const collabWs = await connectWs(baseUrl, collabCookie);

    const started = Date.now();
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      headers: { cookie: ownerCookie, 'x-client-id': 'tab-1' },
      payload: { title: 'Live title' },
    });

    const collabEvent = await collabWs.waitFor('note.updated', 1000);
    expect(Date.now() - started).toBeLessThan(1000);
    expect((collabEvent.payload as { title: string }).title).toBe('Live title');

    const ownEvent = await ownerWs.waitFor('note.updated', 1000);
    expect(ownEvent.origin).toBe('tab-1'); // mutating tab drops its own echo

    ownerWs.close();
    collabWs.close();
  });

  it('per-user state stays isolated: my pin/color/labels emit only to MY devices', async () => {
    const ownerWs = await connectWs(baseUrl, ownerCookie);
    const collabWs = await connectWs(baseUrl, collabCookie);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}/state`,
      headers: { cookie: ownerCookie },
      payload: { pinned: true, color: 'coral' },
    });

    const ownState = await ownerWs.waitFor('note.state_changed', 1000);
    expect((ownState.payload as { color: string }).color).toBe('coral');

    // Labels are per-user too: attaching one must not leak to the collaborator.
    const label = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: ownerCookie },
      payload: { name: 'isolation-tag' },
    });
    await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/labels/${label.json().id}`,
      headers: { cookie: ownerCookie },
    });
    await ownerWs.waitFor('note.labels_changed', 1000);

    // The collaborator must receive NOTHING for the owner's per-user changes.
    await new Promise((r) => setTimeout(r, 400));
    expect(collabWs.events.filter((e) => e.type === 'note.state_changed')).toHaveLength(0);
    expect(collabWs.events.filter((e) => e.type === 'note.labels_changed')).toHaveLength(0);

    ownerWs.close();
    collabWs.close();
  });

  it('items propagate to members', async () => {
    const collabWs = await connectWs(baseUrl, collabCookie);
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/convert`,
      headers: { cookie: ownerCookie },
      payload: { to: 'list' },
    });
    await collabWs.waitFor('note.converted', 1000);

    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/items`,
      headers: { cookie: ownerCookie },
      payload: { text: 'from owner' },
    });
    const itemEvent = await collabWs.waitFor('item.added', 1000);
    expect((itemEvent.payload as { item: { text: string } }).item.text).toBe('from owner');
    collabWs.close();
  });

  it('collaborator leaves: labels+reminder cleaned, gets note.removed on other devices', async () => {
    const collabSession = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: collabCookie },
    });
    const collabId = collabSession.json().user.id as string;

    // Collaborator adds a label + reminder on the shared note.
    const labelRes = await t.app.inject({
      method: 'POST',
      url: '/api/labels',
      headers: { cookie: collabCookie },
      payload: { name: 'shared-tag' },
    });
    await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/labels/${labelRes.json().id}`,
      headers: { cookie: collabCookie },
    });
    await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/reminder`,
      headers: { cookie: collabCookie },
      payload: {
        remindAt: new Date(Date.now() + 3600_000).toISOString(),
        timezone: 'America/Fortaleza',
      },
    });

    const collabWs = await connectWs(baseUrl, collabCookie);
    const leave = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}/collaborators/${collabId}`,
      headers: { cookie: collabCookie },
    });
    expect(leave.statusCode).toBe(204);
    const removed = await collabWs.waitFor('note.removed', 1000);
    expect((removed.payload as { reason: string }).reason).toBe('left');

    const list = await t.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: { cookie: collabCookie },
    });
    expect((list.json() as FullNote[]).some((n) => n.id === noteId)).toBe(false);
    collabWs.close();
  });

  it('owner cannot leave; collaborator cannot remove others', async () => {
    const ownerSession = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: ownerCookie },
    });
    const ownerId = ownerSession.json().user.id as string;
    const res = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}/collaborators/${ownerId}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(400);

    // Re-invite the collaborator (they left in the previous test), then have
    // them try to remove the owner — members can only remove themselves.
    const reinvite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie: ownerCookie },
      payload: { email: collabEmail },
    });
    expect(reinvite.statusCode).toBe(201);
    const foreign = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${noteId}/collaborators/${ownerId}`,
      headers: { cookie: collabCookie },
    });
    expect(foreign.statusCode).toBe(403);
  });
});
