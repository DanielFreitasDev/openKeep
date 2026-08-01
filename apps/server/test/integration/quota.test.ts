import type { FullNote, StorageUsage } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

const MB = 1024 * 1024;

/** A text attachment of exactly n bytes: no signature to fake, just UTF-8. */
const textOf = (n: number) => Buffer.alloc(n, 'a');

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

describe('storage quota', () => {
  let t: TestApp;
  let cookie: string;
  let noteId: string;

  beforeAll(async () => {
    t = await createTestApp({ USER_STORAGE_QUOTA_MB: '1' });
    cookie = await t.signUp('quota@example.com', 'Quota');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'Files' },
    });
    noteId = (res.json() as FullNote).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const uploadFile = async (buf: Buffer, as = cookie, target = noteId) => {
    const { payload, headers } = multipartBody(buf, 'notes.txt', 'text/plain');
    return t.app.inject({
      method: 'POST',
      url: `/api/notes/${target}/files`,
      headers: { ...headers, cookie: as },
      payload,
    });
  };

  const usage = async (as = cookie) =>
    (
      await t.app.inject({ method: 'GET', url: '/api/storage', headers: { cookie: as } })
    ).json() as StorageUsage;

  it('reports usage against the instance ceiling', async () => {
    expect(await usage()).toEqual({ usedBytes: 0, quotaBytes: MB });

    expect((await uploadFile(textOf(600_000))).statusCode).toBe(201);

    expect(await usage()).toEqual({ usedBytes: 600_000, quotaBytes: MB });
  });

  it('refuses the upload that would cross it, with its own code', async () => {
    const res = await uploadFile(textOf(600_000));
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('storage_quota_exceeded');
    // Nothing was written: a refusal is not a partial upload.
    expect((await usage()).usedBytes).toBe(600_000);
  });

  it('lets the account in again once it frees space', async () => {
    const note = (
      await t.app.inject({ method: 'GET', url: `/api/notes/${noteId}`, headers: { cookie } })
    ).json() as FullNote;
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/attachments/${note.attachments[0]!.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    expect((await usage()).usedBytes).toBe(0);
    expect((await uploadFile(textOf(600_000))).statusCode).toBe(201);
  });

  it("charges a collaborator's upload to the note's owner", async () => {
    const guestCookie = await t.signUp('guest@example.com', 'Guest');
    const invite = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie },
      payload: { email: 'guest@example.com' },
    });
    expect(invite.statusCode).toBe(201);

    // The guest's own tab is empty, but the note's owner is nearly full.
    expect((await usage(guestCookie)).usedBytes).toBe(0);
    const res = await uploadFile(textOf(600_000), guestCookie);
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('storage_quota_exceeded');

    // On a note of their own the same bytes go through.
    const own = (
      await t.app.inject({
        method: 'POST',
        url: '/api/notes',
        headers: { cookie: guestCookie },
        payload: { title: 'Mine' },
      })
    ).json() as FullNote;
    expect((await uploadFile(textOf(600_000), guestCookie, own.id)).statusCode).toBe(201);
  });

  it('counts a copy as new bytes', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/copy`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('storage_quota_exceeded');
  });

  it('counts what the trash still holds', async () => {
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/trash`,
      headers: { cookie },
    });
    expect((await usage()).usedBytes).toBe(600_000);
  });
});

describe('storage quota — unset', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('is no ceiling at all', async () => {
    const cookie = await t.signUp('nolimit@example.com', 'No limit');
    const note = (
      await t.app.inject({
        method: 'POST',
        url: '/api/notes',
        headers: { cookie },
        payload: { title: 'Files' },
      })
    ).json() as FullNote;

    const { payload, headers } = multipartBody(textOf(2 * MB), 'big.txt', 'text/plain');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/files`,
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(201);

    const usage = (
      await t.app.inject({ method: 'GET', url: '/api/storage', headers: { cookie } })
    ).json() as StorageUsage;
    expect(usage).toEqual({ usedBytes: 2 * MB, quotaBytes: null });
  });
});
