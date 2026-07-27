import type { Attachment, FullNote } from '@openkeep/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOrQueue, storeFetched } from '../../src/modules/link-preview/service.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

async function makePng(width = 64, height = 48): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 175, b: 168 } },
  })
    .png()
    .toBuffer();
}

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

describe('attachments', () => {
  let t: TestApp;
  let cookie: string;
  let noteId: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('media@example.com', 'Media');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'With image' },
    });
    noteId = (res.json() as FullNote).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const upload = async (buf: Buffer, filename = 'x.png', ctype = 'image/png') => {
    const { payload, headers } = multipartBody(buf, filename, ctype);
    return t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/attachments`,
      headers: { ...headers, cookie },
      payload,
    });
  };

  it('uploads a PNG, generates a thumb, appears in FullNote', async () => {
    const res = await upload(await makePng());
    expect(res.statusCode).toBe(201);
    const att = res.json() as Attachment;
    expect(att.kind).toBe('image');
    expect(att.mime).toBe('image/png');
    expect(att.width).toBe(64);
    expect(att.hasThumb).toBe(true);

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const note = (list.json() as FullNote[]).find((n) => n.id === noteId);
    expect(note?.attachments.map((a) => a.id)).toContain(att.id);

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/file`,
      headers: { cookie },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cache-control']).toContain('immutable');

    const thumb = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/thumb`,
      headers: { cookie },
    });
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/webp');
  });

  it('rejects non-image bytes regardless of declared mime (no SVG)', async () => {
    const fakePng = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const res = await upload(fakePng, 'evil.png', 'image/png');
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe('unsupported_media_type');
  });

  it('strangers cannot fetch attachments (404, no oracle)', async () => {
    const uploadRes = await upload(await makePng());
    const att = uploadRes.json() as Attachment;
    const stranger = await t.signUp('stranger-media@example.com', 'S');
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/file`,
      headers: { cookie: stranger },
    });
    expect(res.statusCode).toBe(404);
  });

  it('deletes an attachment (row + files)', async () => {
    const uploadRes = await upload(await makePng());
    const att = uploadRes.json() as Attachment;
    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/attachments/${att.id}`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    const gone = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/file`,
      headers: { cookie },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('copying a note duplicates attachment files', async () => {
    const fresh = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'Copy source' },
    });
    const srcId = (fresh.json() as FullNote).id;
    const { payload, headers } = multipartBody(await makePng(32, 32), 'a.png', 'image/png');
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${srcId}/attachments`,
      headers: { ...headers, cookie },
      payload,
    });

    const copy = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${srcId}/copy`,
      headers: { cookie },
    });
    const copied = copy.json() as FullNote;
    expect(copied.attachments).toHaveLength(1);
    expect(copied.attachments[0]!.id).not.toBe(srcId);

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${copied.attachments[0]!.id}/file`,
      headers: { cookie },
    });
    expect(file.statusCode).toBe(200);
  });

  it('search type=image now matches notes with images', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?type=image',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FullNote[]).some((n) => n.id === noteId)).toBe(true);
  });
});

describe('link previews', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('links@example.com', 'Links');
  });
  afterAll(async () => {
    await t.close();
  });

  it('returns pending + enqueues on first request, cached on later ones', async () => {
    const url = 'https://example.com/article';
    const first = await t.app.inject({
      method: 'GET',
      url: `/api/link-previews?url=${encodeURIComponent(url)}`,
      headers: { cookie },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('pending');

    // Simulate the worker completing.
    await storeFetched(t.db, `${url}`, {
      ok: true,
      title: 'Example Article',
      siteName: 'Example',
      faviconUrl: 'https://example.com/favicon.ico',
    });

    const second = await t.app.inject({
      method: 'GET',
      url: `/api/link-previews?url=${encodeURIComponent(url)}`,
      headers: { cookie },
    });
    expect(second.json()).toMatchObject({ status: 'ok', title: 'Example Article' });
  });

  it('respects the rich-previews setting', async () => {
    await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { richLinkPreviews: false },
    });
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/link-previews?url=https%3A%2F%2Fexample.com%2Fx',
      headers: { cookie },
    });
    expect(res.json().status).toBe('disabled');
    await t.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie },
      payload: { richLinkPreviews: true },
    });
  });

  it('getOrQueue does not re-enqueue while pending', async () => {
    const url = 'https://example.org/once';
    const a = await getOrQueue(t.db, url);
    expect(a.enqueue).not.toBeNull();
    const b = await getOrQueue(t.db, url);
    expect(b.enqueue).toBeNull();
    expect(b.preview.status).toBe('pending');
  });
});
