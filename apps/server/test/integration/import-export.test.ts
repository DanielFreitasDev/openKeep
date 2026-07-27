import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { FullNote } from '@openkeep/shared';
import { ZipArchive } from 'archiver';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runExport, runTakeoutImport } from '../../src/modules/import-export/service.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

async function buildTakeoutZip(target: string, withImage: Buffer): Promise<void> {
  const out = fs.createWriteStream(target);
  const archive = new ZipArchive({ zlib: { level: 1 } });
  archive.pipe(out);

  const note = (name: string, json: Record<string, unknown>) =>
    archive.append(JSON.stringify(json), { name: `Takeout/Keep/${name}` });

  note('groceries.json', {
    title: 'Groceries (imported)',
    listContent: [
      { text: 'Milk', isChecked: false },
      { text: 'Bread', isChecked: true },
    ],
    color: 'GREEN',
    isPinned: true,
    labels: [{ name: 'Imported' }],
    createdTimestampUsec: 1721908800000000,
  });
  note('idea.json', {
    title: 'Idea',
    textContent: 'Build an open Keep\nwith friends',
    color: 'GRAY',
    isArchived: true,
    createdTimestampUsec: 1721908900000000,
  });
  note('trashed.json', {
    title: 'Old junk',
    textContent: 'bye',
    isTrashed: true,
    createdTimestampUsec: 1721909000000000,
  });
  note('photo.json', {
    title: 'Photo note',
    textContent: '',
    attachments: [{ filePath: 'photo1.png', mimetype: 'image/png' }],
    createdTimestampUsec: 1721909100000000,
  });
  archive.append(withImage, { name: 'Takeout/Keep/photo1.png' });
  archive.append('not a keep note', { name: 'Takeout/Other/readme.txt' });

  await archive.finalize();
  await once(out, 'close');
}

describe('takeout import & export', () => {
  let t: TestApp;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('io@example.com', 'IO');
    const session = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    userId = session.json().user.id;
    void userId;
  });
  afterAll(async () => {
    await t.close();
  });

  it('imports a Takeout zip end-to-end (idempotent on re-run)', async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 10, g: 200, b: 100 } },
    })
      .png()
      .toBuffer();

    const zipDir = `${process.env.TMPDIR ?? '/tmp'}/openkeep-test-takeout`;
    fs.mkdirSync(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, `takeout-${Date.now()}.zip`);
    await buildTakeoutZip(zipPath, png);
    const zipBuffer = fs.readFileSync(zipPath);

    // Upload through the API.
    const boundary = '----okimport';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="takeout.zip"\r\nContent-Type: application/zip\r\n\r\n`,
      ),
      zipBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upload = await t.app.inject({
      method: 'POST',
      url: '/api/import/takeout',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(upload.statusCode).toBe(202);
    const { jobId } = upload.json();

    // Run the worker body directly (pg-boss isn't running in tests).
    await runTakeoutImport(t.db, t.storage, jobId);

    const job = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
      headers: { cookie },
    });
    expect(job.json()).toMatchObject({ status: 'done', progress: 4, total: 4 });
    expect(JSON.parse(job.json().summary)).toEqual({ imported: 4, skipped: 0 });

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const notes = list.json() as FullNote[];
    const groceries = notes.find((n) => n.title === 'Groceries (imported)');
    expect(groceries).toMatchObject({ type: 'list', color: 'mint', pinned: true });
    expect(groceries?.items.map((i) => [i.text, i.checked])).toEqual([
      ['Milk', false],
      ['Bread', true],
    ]);
    expect(groceries?.labelIds).toHaveLength(1);

    const idea = notes.find((n) => n.title === 'Idea');
    expect(idea).toMatchObject({ archived: true, color: 'chalk' });
    expect(idea?.bodyHtml).toContain('Build an open Keep');

    const junk = notes.find((n) => n.title === 'Old junk');
    expect(junk?.trashedAt).not.toBeNull();

    const photo = notes.find((n) => n.title === 'Photo note');
    expect(photo?.attachments).toHaveLength(1);

    // Re-import: everything skipped via fingerprints.
    const secondKey = t.storage.newKey('zip');
    await t.storage.write('exports', secondKey, zipBuffer);
    const { createJob } = await import('../../src/modules/import-export/service.js');
    const rerun = await createJob(t.db, userId, 'import', secondKey);
    await runTakeoutImport(t.db, t.storage, rerun.id);
    const rerunJob = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${rerun.id}`,
      headers: { cookie },
    });
    expect(JSON.parse(rerunJob.json().summary)).toEqual({ imported: 0, skipped: 4 });
  });

  it('exports user data as a downloadable zip', async () => {
    const start = await t.app.inject({ method: 'POST', url: '/api/export', headers: { cookie } });
    expect(start.statusCode).toBe(202);
    const { jobId } = start.json();

    await runExport(t.db, t.storage, jobId);

    const job = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
      headers: { cookie },
    });
    expect(job.json()).toMatchObject({ status: 'done', downloadReady: true });

    const download = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}/download`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('application/zip');
    expect(download.rawPayload.readUInt32LE(0)).toBe(0x04034b50); // zip magic
    expect(download.rawPayload.length).toBeGreaterThan(500);
  });

  it('rejects non-zip uploads and foreign job access', async () => {
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/import/takeout',
      headers: {
        cookie,
        'content-type': 'multipart/form-data; boundary=----x',
      },
      payload: Buffer.from(
        '------x\r\nContent-Disposition: form-data; name="file"; filename="a.zip"\r\nContent-Type: application/zip\r\n\r\nnot-a-zip\r\n------x--\r\n',
      ),
    });
    expect(bad.statusCode).toBe(415);

    const other = await t.signUp('io-other@example.com', 'Other');
    const start = await t.app.inject({ method: 'POST', url: '/api/export', headers: { cookie } });
    const foreign = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${start.json().jobId}`,
      headers: { cookie: other },
    });
    expect(foreign.statusCode).toBe(404);
  });
});
