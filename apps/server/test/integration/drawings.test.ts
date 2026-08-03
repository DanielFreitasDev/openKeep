import type { Attachment, DrawingData, FullNote } from '@openkeep/shared';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

async function makePng(width = 640, height = 480): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .png()
    .toBuffer();
}

function drawing(strokes: DrawingData['strokes']): DrawingData {
  return { version: 1, width: 800, height: 600, background: 'none', strokes };
}

const PEN_STROKE: DrawingData['strokes'][number] = {
  tool: 'pen',
  color: '#000000',
  size: 4,
  points: [10, 10, 50, 50, 90, 30],
};

/** The `drawing` JSON field goes before the file so busboy buffers it first. */
function drawingMultipart(fileBuf: Buffer, body: unknown) {
  const boundary = `----okboundary${Math.random().toString(36).slice(2)}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="drawing"\r\n\r\n${JSON.stringify(body)}\r\n`,
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="drawing.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    fileBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('drawings', () => {
  let t: TestApp;
  let cookie: string;
  let noteId: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('drawings@example.com', 'Drawings');
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'With drawing' },
    });
    noteId = (res.json() as FullNote).id;
  });
  afterAll(async () => {
    await t.close();
  });

  const create = async (body: unknown = drawing([PEN_STROKE])) => {
    const { payload, headers } = drawingMultipart(await makePng(), body);
    return t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/drawings`,
      headers: { ...headers, cookie },
      payload,
    });
  };

  it('creates a drawing: PNG render + editable strokes + thumb', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    const att = res.json() as Attachment;
    expect(att.kind).toBe('drawing');
    expect(att.mime).toBe('image/png');
    expect(att.hasThumb).toBe(true);
    expect(att.updatedAt).toBeTruthy();

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const note = (list.json() as FullNote[]).find((n) => n.id === noteId);
    expect(note?.attachments.some((a) => a.id === att.id && a.kind === 'drawing')).toBe(true);

    const data = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/drawing`,
      headers: { cookie },
    });
    expect(data.statusCode).toBe(200);
    expect(data.json() as DrawingData).toEqual(drawing([PEN_STROKE]));

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/file`,
      headers: { cookie },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
  });

  it('re-saving replaces strokes and render in place, bumping updatedAt', async () => {
    const created = (await create()).json() as Attachment;
    const next = drawing([
      PEN_STROKE,
      { tool: 'highlighter', color: '#FFBC00', size: 28, points: [0, 0, 100, 100] },
    ]);
    const { payload, headers } = drawingMultipart(await makePng(320, 200), next);
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/attachments/${created.id}/drawing`,
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json() as Attachment;
    expect(updated.id).toBe(created.id);
    expect(updated.width).toBe(320);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );

    const data = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${created.id}/drawing`,
      headers: { cookie },
    });
    expect((data.json() as DrawingData).strokes).toHaveLength(2);
  });

  it('rejects invalid drawing data with 400', async () => {
    const res = await create({ version: 1, width: 800, height: 600 });
    expect(res.statusCode).toBe(400);
  });

  it('plain image attachments have no drawing data (404)', async () => {
    const png = await makePng(32, 32);
    const boundary = `----okboundary${Math.random().toString(36).slice(2)}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      png,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/attachments`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie },
      payload,
    });
    const att = up.json() as Attachment;
    const res = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${att.id}/drawing`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
  });

  it('strangers get 404 for drawing data and updates (no oracle)', async () => {
    const created = (await create()).json() as Attachment;
    const stranger = await t.signUp('stranger-drawing@example.com', 'S');
    const read = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${created.id}/drawing`,
      headers: { cookie: stranger },
    });
    expect(read.statusCode).toBe(404);
    const { payload, headers } = drawingMultipart(await makePng(), drawing([PEN_STROKE]));
    const write = await t.app.inject({
      method: 'PUT',
      url: `/api/attachments/${created.id}/drawing`,
      headers: { ...headers, cookie: stranger },
      payload,
    });
    expect(write.statusCode).toBe(404);
  });

  it('search type=drawing matches notes with drawings', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?type=drawing',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as FullNote[]).some((n) => n.id === noteId)).toBe(true);
  });

  it('copying a note keeps the copy editable (drawingData copied)', async () => {
    const fresh = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'Drawing copy source' },
    });
    const srcId = (fresh.json() as FullNote).id;
    const { payload, headers } = drawingMultipart(await makePng(64, 64), drawing([PEN_STROKE]));
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${srcId}/drawings`,
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
    const data = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${copied.attachments[0]!.id}/drawing`,
      headers: { cookie },
    });
    expect(data.statusCode).toBe(200);
    expect((data.json() as DrawingData).strokes).toHaveLength(1);
  });

  describe('over a photo', () => {
    /** Upload a plain image and return it — the thing a drawing is drawn over. */
    const uploadPhoto = async (targetNote: string) => {
      const boundary = `----okboundary${Math.random().toString(36).slice(2)}`;
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        await makePng(240, 160),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${targetNote}/attachments`,
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie },
        payload,
      });
      return res.json() as Attachment;
    };

    const makeJpeg = () =>
      sharp({ create: { width: 240, height: 160, channels: 3, background: '#c83c3c' } })
        .jpeg()
        .toBuffer();

    it('stores the composite as JPEG and reports the photo it covers', async () => {
      const photo = await uploadPhoto(noteId);
      const body = { ...drawing([PEN_STROKE]), photoAttachmentId: photo.id };
      const { payload, headers } = drawingMultipart(await makeJpeg(), body);
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${noteId}/drawings`,
        headers: { ...headers, cookie },
        payload,
      });
      expect(res.statusCode).toBe(201);
      const att = res.json() as Attachment;
      expect(att.mime).toBe('image/jpeg');
      // The DTO carries the link, so clients hide the bare photo without
      // having to fetch every drawing's vectors first.
      expect(att.photoAttachmentId).toBe(photo.id);
      expect(photo.photoAttachmentId).toBeNull();

      const file = await t.app.inject({
        method: 'GET',
        url: `/api/attachments/${att.id}/file`,
        headers: { cookie },
      });
      expect(file.headers['content-type']).toBe('image/jpeg');
    });

    it('a copy points at its own photo, not the original note′s', async () => {
      const fresh = await t.app.inject({
        method: 'POST',
        url: '/api/notes',
        headers: { cookie },
        payload: { title: 'Photo drawing source' },
      });
      const srcId = (fresh.json() as FullNote).id;
      const photo = await uploadPhoto(srcId);
      const { payload, headers } = drawingMultipart(await makeJpeg(), {
        ...drawing([PEN_STROKE]),
        photoAttachmentId: photo.id,
      });
      await t.app.inject({
        method: 'POST',
        url: `/api/notes/${srcId}/drawings`,
        headers: { ...headers, cookie },
        payload,
      });

      const copy = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${srcId}/copy`,
        headers: { cookie },
      });
      const copied = copy.json() as FullNote;
      const copiedDrawing = copied.attachments.find((a) => a.kind === 'drawing');
      const copiedPhoto = copied.attachments.find((a) => a.kind === 'image');
      expect(copiedDrawing?.photoAttachmentId).toBe(copiedPhoto?.id);
      expect(copiedDrawing?.photoAttachmentId).not.toBe(photo.id);
    });

    it('refuses a render that is neither PNG nor JPEG', async () => {
      const webp = await sharp({
        create: { width: 32, height: 32, channels: 3, background: '#ffffff' },
      })
        .webp()
        .toBuffer();
      const { payload, headers } = drawingMultipart(webp, drawing([PEN_STROKE]));
      const res = await t.app.inject({
        method: 'POST',
        url: `/api/notes/${noteId}/drawings`,
        headers: { ...headers, cookie },
        payload,
      });
      expect(res.statusCode).toBe(415);
    });
  });
});
