import type { Attachment, FullNote } from '@openkeep/shared';
import { LIMITS } from '@openkeep/shared';
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

  // A browser recording, as MediaRecorder frames it: EBML header, DocType
  // webm, then the track's codec id. The bytes are stored as-is, so a
  // hand-built head is the whole contract this route has with the file.
  const ebml = (...codecs: string[]) =>
    Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from('\x42\x86\x81\x01webm'),
      Buffer.from(codecs.join('\0')),
      Buffer.alloc(64),
    ]);

  const uploadAudio = async (buf: Buffer, targetNoteId = noteId) => {
    const { payload, headers } = multipartBody(buf, 'recording.webm', 'audio/webm');
    return t.app.inject({
      method: 'POST',
      url: `/api/notes/${targetNoteId}/audio`,
      headers: { ...headers, cookie },
      payload,
    });
  };

  it('uploads a browser recording, stored as-is with no thumb', async () => {
    const res = await uploadAudio(ebml('A_OPUS'));
    expect(res.statusCode).toBe(201);
    const att = res.json() as Attachment;
    expect(att.kind).toBe('audio');
    expect(att.mime).toBe('audio/webm');
    expect(att.hasThumb).toBe(false);

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/file`,
      headers: { cookie },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('audio/webm');
    expect(file.rawPayload.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const note = (list.json() as FullNote[]).find((n) => n.id === noteId);
    expect(note?.attachments.map((a) => a.id)).toContain(att.id);
  });

  it('rejects a webm carrying video, and non-audio bytes', async () => {
    const video = await uploadAudio(ebml('V_VP9', 'A_OPUS'));
    expect(video.statusCode).toBe(415);
    expect(video.json().code).toBe('unsupported_media_type');

    const png = await uploadAudio(await makePng());
    expect(png.statusCode).toBe(415);
  });

  it('a stranger gets the same 404 as a missing note', async () => {
    const stranger = await t.signUp('stranger-audio@example.com', 'S');
    const { payload, headers } = multipartBody(ebml('A_OPUS'), 'r.webm', 'audio/webm');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/audio`,
      headers: { ...headers, cookie: stranger },
      payload,
    });
    expect(res.statusCode).toBe(404);
  });

  const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
  const ZIP_BYTES = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);

  const uploadFile = async (buf: Buffer, filename: string, ctype = 'application/octet-stream') => {
    const { payload, headers } = multipartBody(buf, filename, ctype);
    return t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/files`,
      headers: { ...headers, cookie },
      payload,
    });
  };

  it('attaches a PDF, stored as-is and downloaded under its own name', async () => {
    const res = await uploadFile(PDF_BYTES, 'Orçamento final.pdf');
    expect(res.statusCode).toBe(201);
    const att = res.json() as Attachment;
    expect(att.kind).toBe('file');
    expect(att.mime).toBe('application/pdf');
    expect(att.filename).toBe('Orçamento final.pdf');
    expect(att.hasThumb).toBe(false);

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/file`,
      headers: { cookie },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    // Downloaded, never rendered on our own origin — and the accented name
    // survives in the RFC 5987 form while the fallback stays ASCII.
    expect(file.headers['content-disposition']).toBe(
      `attachment; filename="Or_amento final.pdf"; filename*=UTF-8''Or%C3%A7amento%20final.pdf`,
    );
    expect(file.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const note = (list.json() as FullNote[]).find((n) => n.id === noteId);
    expect(note?.attachments.find((a) => a.id === att.id)?.filename).toBe('Orçamento final.pdf');
  });

  it('an image download is still served inline', async () => {
    const png = await upload(await makePng());
    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${(png.json() as Attachment).id}/file`,
      headers: { cookie },
    });
    expect(file.headers['content-disposition']).toBeUndefined();
  });

  it('the extension names the format inside the container', async () => {
    const docx = await uploadFile(ZIP_BYTES, 'contract.docx');
    expect(docx.statusCode).toBe(201);
    expect((docx.json() as Attachment).mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('refuses what the bytes contradict and what the allowlist omits', async () => {
    const renamed = await uploadFile(PDF_BYTES, 'contract.docx');
    expect(renamed.statusCode).toBe(415);
    expect(renamed.json().code).toBe('unsupported_media_type');

    const exe = await uploadFile(PDF_BYTES, 'invoice.pdf.exe');
    expect(exe.statusCode).toBe(415);

    // A name that is only a path traversal attempt keeps nothing to match on.
    const traversal = await uploadFile(PDF_BYTES, '../../etc/passwd');
    expect(traversal.statusCode).toBe(415);
  });

  it('rejects a file past the byte cap', async () => {
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(LIMITS.fileMaxBytes, 0x20)]);
    const res = await uploadFile(big, 'huge.pdf');
    expect(res.statusCode).toBe(413);
  });

  it('a viewer cannot attach a file', async () => {
    const viewerCookie = await t.signUp('viewer-file@example.com', 'V');
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/collaborators`,
      headers: { cookie },
      payload: { email: 'viewer-file@example.com', role: 'viewer' },
    });
    const { payload, headers } = multipartBody(PDF_BYTES, 'x.pdf', 'application/pdf');
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/files`,
      headers: { ...headers, cookie: viewerCookie },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('note_read_only');
  });

  it('search has:file matches the note that got the document', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?q=has%3Afile',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FullNote[]).some((n) => n.id === noteId)).toBe(true);
  });

  it('search type=audio matches the note that got the recording', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?type=audio',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FullNote[]).some((n) => n.id === noteId)).toBe(true);
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
