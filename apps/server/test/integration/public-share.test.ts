import type { Attachment, FullNote, PublicNote, ShareLink } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noteShareLinks } from '../../src/db/schema/sharing.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

function multipartBody(fileBuf: Buffer, filename: string, contentType: string) {
  const boundary = `----okboundary${Math.random().toString(36).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, fileBuf, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('public share links', () => {
  let t: TestApp;
  let owner: string;
  let other: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = await t.signUp('link-owner@example.com', 'Owner');
    other = await t.signUp('link-other@example.com', 'Other');
  });
  afterAll(async () => {
    await t.close();
  });

  const createNote = async (payload: Record<string, unknown>, cookie = owner) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  const createLink = async (noteId: string, cookie = owner, expiresInDays: number | null = null) =>
    t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/share-link`,
      headers: { cookie },
      payload: { expiresInDays },
    });

  /** What a reader does: the token in the path, no cookie anywhere. */
  const readPublic = (url: string) =>
    t.app.inject({ method: 'GET', url: `/api/public/notes/${new URL(url).pathname.slice(3)}` });

  it('serves the note to anyone holding the link, with no session', async () => {
    const note = await createNote({ title: 'Recipe', bodyHtml: '<p>Two eggs</p>' });
    const created = await createLink(note.id);
    expect(created.statusCode).toBe(201);
    const { url, expiresAt } = created.json() as ShareLink;
    if (!url) throw new Error('no url');
    expect(url).toMatch(/^http.*\/s\/[A-Za-z0-9_-]+$/);
    expect(expiresAt).toBeNull();

    // The owner's GET reports the same address — it is stored, not one-shot.
    const mine = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${note.id}/share-link`,
      headers: { cookie: owner },
    });
    expect((mine.json() as ShareLink).url).toBe(url);

    const res = await readPublic(url);
    expect(res.statusCode).toBe(200);
    const publicNote = res.json() as PublicNote;
    expect(publicNote.title).toBe('Recipe');
    expect(publicNote.bodyHtml).toContain('Two eggs');
    expect(res.headers['x-robots-tag']).toContain('noindex');
    // Nothing per-user and nobody's identity rides along.
    expect(Object.keys(publicNote)).not.toContain('collaborators');
    expect(Object.keys(publicNote)).not.toContain('labelIds');
    expect(Object.keys(publicNote)).not.toContain('reminder');
  });

  it('carries checklist items in order', async () => {
    const note = await createNote({
      type: 'list',
      title: 'Groceries',
      items: [{ text: 'Milk' }, { text: 'Bread', checked: true }],
    });
    const { url } = (await createLink(note.id)).json() as ShareLink;
    if (!url) throw new Error('no url');
    const publicNote = (await readPublic(url)).json() as PublicNote;
    expect(publicNote.type).toBe('list');
    expect(publicNote.items.map((i) => i.text)).toEqual(['Milk', 'Bread']);
    expect(publicNote.items[1]?.checked).toBe(true);
  });

  it('serves the note’s attachments and nothing else', async () => {
    const note = await createNote({ title: 'With a photo' });
    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    const { payload, headers } = multipartBody(png, 'x.png', 'image/png');
    const uploaded = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/attachments`,
      headers: { ...headers, cookie: owner },
      payload,
    });
    const att = uploaded.json() as Attachment;

    const { url } = (await createLink(note.id)).json() as ShareLink;
    if (!url) throw new Error('no url');
    const token = new URL(url).pathname.slice(3);

    const publicNote = (await readPublic(url)).json() as PublicNote;
    expect(publicNote.attachments.map((a) => a.id)).toEqual([att.id]);

    for (const variant of ['file', 'thumb'] as const) {
      const bytes = await t.app.inject({
        method: 'GET',
        url: `/api/public/notes/${token}/attachments/${att.id}/${variant}`,
      });
      expect(bytes.statusCode).toBe(200);
      expect(bytes.rawPayload.length).toBeGreaterThan(0);
    }

    // An attachment of another note is a 404 through this token: the token
    // scopes the lookup, which is what a signed URL would have bought.
    const stranger = await createNote({ title: 'Not shared' });
    const strangerPart = multipartBody(png, 'y.png', 'image/png');
    const otherUpload = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${stranger.id}/attachments`,
      headers: { ...strangerPart.headers, cookie: owner },
      payload: strangerPart.payload,
    });
    const otherAtt = otherUpload.json() as Attachment;
    const leak = await t.app.inject({
      method: 'GET',
      url: `/api/public/notes/${token}/attachments/${otherAtt.id}/file`,
    });
    expect(leak.statusCode).toBe(404);
  });

  it('only the owner can issue, see or revoke the link', async () => {
    const note = await createNote({ title: 'Shared with an editor' });
    const invite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/collaborators`,
      headers: { cookie: owner },
      payload: { email: 'link-other@example.com', role: 'collaborator' },
    });
    expect(invite.statusCode).toBe(201);

    expect((await createLink(note.id, other)).statusCode).toBe(403);
    const theirs = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${note.id}/share-link`,
      headers: { cookie: other },
    });
    expect(theirs.statusCode).toBe(403);
    const theirRevoke = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}/share-link`,
      headers: { cookie: other },
    });
    expect(theirRevoke.statusCode).toBe(403);
  });

  it('re-issuing replaces the address and revoking kills it', async () => {
    const note = await createNote({ title: 'Rotating' });
    const first = ((await createLink(note.id)).json() as ShareLink).url;
    const second = ((await createLink(note.id)).json() as ShareLink).url;
    if (!first || !second) throw new Error('no url');
    expect(second).not.toBe(first);
    expect((await readPublic(first)).statusCode).toBe(404);
    expect((await readPublic(second)).statusCode).toBe(200);

    const revoked = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}/share-link`,
      headers: { cookie: owner },
    });
    expect(revoked.statusCode).toBe(204);
    expect((await readPublic(second)).statusCode).toBe(404);
    const after = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${note.id}/share-link`,
      headers: { cookie: owner },
    });
    expect((after.json() as ShareLink).url).toBeNull();
  });

  it('goes dark while the note is in the trash and comes back on restore', async () => {
    const note = await createNote({ title: 'Trashable' });
    const { url } = (await createLink(note.id)).json() as ShareLink;
    if (!url) throw new Error('no url');

    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/trash`,
      headers: { cookie: owner },
    });
    expect((await readPublic(url)).statusCode).toBe(404);

    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/restore`,
      headers: { cookie: owner },
    });
    expect((await readPublic(url)).statusCode).toBe(200);
  });

  it('stops resolving once it expires', async () => {
    const note = await createNote({ title: 'Expiring' });
    const created = await createLink(note.id, owner, 7);
    const { url, expiresAt } = created.json() as ShareLink;
    if (!url) throw new Error('no url');
    expect(expiresAt).not.toBeNull();
    expect((await readPublic(url)).statusCode).toBe(200);

    // Aged past its date in place — the same row the route reads.
    await t.db
      .update(noteShareLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(noteShareLinks.noteId, note.id));
    expect((await readPublic(url)).statusCode).toBe(404);
  });

  it('gives an unknown token the same nothing a revoked one gets', async () => {
    const unknown = await t.app.inject({
      method: 'GET',
      url: '/api/public/notes/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(unknown.statusCode).toBe(404);
    const malformed = await t.app.inject({ method: 'GET', url: '/api/public/notes/nope' });
    expect(malformed.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('needs a session to manage the link', async () => {
    const note = await createNote({ title: 'Anonymous attempt' });
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/share-link`,
      payload: { expiresInDays: null },
    });
    expect(res.statusCode).toBe(401);
  });
});
