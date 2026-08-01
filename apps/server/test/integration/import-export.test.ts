import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FullNote, WsEvent } from '@openkeep/shared';
import { ZipArchive } from 'archiver';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { userJobs } from '../../src/db/schema/jobs.js';
import { exportUserDataJob, importTakeoutJob, linkPreviewFetchJob } from '../../src/jobs/index.js';
import {
  cleanupExpiredExports,
  cleanupStaleImports,
  createJob,
  reconcileStorage,
  runExport,
  runTakeoutImport,
} from '../../src/modules/import-export/service.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

/** Edit stamp of `photo.json` — must survive attachment ingest. */
const PHOTO_EDITED_USEC = 1721909200000000;

async function buildTakeoutZip(
  target: string,
  withImage: Buffer,
  withBrokenImage: Buffer,
): Promise<void> {
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
    sharees: [
      { email: 'io@example.com', isOwner: true, type: 'USER' },
      { email: 'friend@example.com', type: 'USER' },
    ],
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
    attachments: [
      { filePath: 'photo1.png', mimetype: 'image/png' },
      { filePath: 'photo2.jpg', mimetype: 'image/jpeg' },
    ],
    createdTimestampUsec: 1721909100000000,
    userEditedTimestampUsec: PHOTO_EDITED_USEC,
  });
  archive.append(withImage, { name: 'Takeout/Keep/photo1.png' });
  archive.append(withBrokenImage, { name: 'Takeout/Keep/photo2.jpg' });
  archive.append('not a keep note', { name: 'Takeout/Other/readme.txt' });

  await archive.finalize();
  await once(out, 'close');
}

/** These tests are about the importer, not the ceiling; quota has its own spec. */
const NO_QUOTA = { quotaBytes: null };

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
    // Warning-level malformed JPEG (valid header, scan cut short) — the shape
    // real Takeout photos arrive in; libvips only accepts it with failOn:'none'.
    // Big enough that lopping off the tail lands inside the scan data rather
    // than the header — a header-level cut is genuinely corrupt and must fail.
    const fullJpeg = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 30, b: 90 } },
    })
      .jpeg({ quality: 90 })
      .toBuffer();
    const brokenJpeg = fullJpeg.subarray(0, Math.floor(fullJpeg.length * 0.6));

    const zipPath = path.join(zipDir, `takeout-${Date.now()}.zip`);
    await buildTakeoutZip(zipPath, png, brokenJpeg);
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
    await runTakeoutImport(t.db, t.storage, jobId, NO_QUOTA);

    const job = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${jobId}`,
      headers: { cookie },
    });
    expect(job.json()).toMatchObject({ status: 'done', progress: 4, total: 4 });
    // Sharing is reported, never re-created: no collaborator row is made.
    expect(JSON.parse(job.json().summary)).toEqual({ imported: 4, skipped: 0, shared: 1 });

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
    // It was shared in Keep; here it is mine alone.
    expect(idea?.collaborators.map((c) => c.role)).toEqual(['owner']);
    expect(idea?.bodyHtml).toContain('Build an open Keep');

    const junk = notes.find((n) => n.title === 'Old junk');
    expect(junk?.trashedAt).not.toBeNull();

    const photo = notes.find((n) => n.title === 'Photo note');
    // Both land — including the truncated JPEG Keep itself exports.
    expect(photo?.attachments).toHaveLength(2);
    // Ingesting media must not stamp "now" over the Takeout edit timestamp.
    expect(new Date(photo!.updatedAt).getTime()).toBe(PHOTO_EDITED_USEC / 1000);

    // Re-import: everything skipped via fingerprints.
    const secondKey = t.storage.newKey('zip');
    await t.storage.write('exports', secondKey, zipBuffer);
    const { createJob } = await import('../../src/modules/import-export/service.js');
    const rerun = await createJob(t.db, userId, 'import', secondKey);
    await runTakeoutImport(t.db, t.storage, rerun.id, NO_QUOTA);
    const rerunJob = await t.app.inject({
      method: 'GET',
      url: `/api/jobs/${rerun.id}`,
      headers: { cookie },
    });
    expect(JSON.parse(rerunJob.json().summary)).toEqual({ imported: 0, skipped: 4, shared: 1 });
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

  it('emits job.* and link_preview.resolved events to the owner only', async () => {
    const events: { userIds: string[]; event: WsEvent }[] = [];
    const realtime = {
      publishToUsers: (userIds: string[], event: WsEvent) => {
        events.push({ userIds: [...userIds], event });
      },
    };

    // Fresh single-note zip → unique fingerprint per run.
    const zipDir = `${process.env.TMPDIR ?? '/tmp'}/openkeep-test-takeout`;
    fs.mkdirSync(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, `takeout-events-${Date.now()}.zip`);
    const out = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 1 } });
    archive.pipe(out);
    archive.append(
      JSON.stringify({
        title: `Events ${Date.now()}`,
        textContent: 'hello',
        createdTimestampUsec: Date.now() * 1000,
      }),
      { name: 'Takeout/Keep/events.json' },
    );
    await archive.finalize();
    await once(out, 'close');

    const key = t.storage.newKey('zip');
    await t.storage.write('exports', key, fs.readFileSync(zipPath));
    const { createJob } = await import('../../src/modules/import-export/service.js');
    const job = await createJob(t.db, userId, 'import', key);

    await importTakeoutJob(t.db, t.storage, job.id, NO_QUOTA, realtime);

    const progress = events.filter((e) => e.event.type === 'job.progress');
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)?.event.payload).toMatchObject({ jobId: job.id, progress: 1, total: 1 });
    expect(events.at(-1)?.event).toMatchObject({
      type: 'job.completed',
      payload: { jobId: job.id, kind: 'import' },
    });
    for (const e of events) expect(e.userIds).toEqual([userId]);

    // Export path publishes a completion event too.
    events.length = 0;
    const exp = await createJob(t.db, userId, 'export');
    await exportUserDataJob(t.db, t.storage, exp.id, realtime);
    expect(events.at(-1)?.event).toMatchObject({
      type: 'job.completed',
      payload: { jobId: exp.id, kind: 'export' },
    });

    // Link preview: even an SSRF-blocked fetch stores a result and notifies
    // the requester with the URL exactly as requested (their cache key).
    events.length = 0;
    await linkPreviewFetchJob(t.db, { url: 'http://10.0.0.1/x', requestedBy: userId }, realtime);
    expect(events).toEqual([
      {
        userIds: [userId],
        event: { type: 'link_preview.resolved', payload: { url: 'http://10.0.0.1/x' } },
      },
    ]);
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

  it('imports audio attachments (kind=audio, playable, searchable) and media on trashed notes', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    // Sniffing goes by magic bytes, so an ID3 header is enough to classify.
    const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]);

    const zipDir = `${process.env.TMPDIR ?? '/tmp'}/openkeep-test-takeout`;
    fs.mkdirSync(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, `takeout-audio-${Date.now()}.zip`);
    const out = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 1 } });
    archive.pipe(out);
    archive.append(
      JSON.stringify({
        title: `Voice memo ${Date.now()}`,
        textContent: 'listen later',
        attachments: [{ filePath: 'memo.mp3', mimetype: 'audio/mp3' }],
        createdTimestampUsec: Date.now() * 1000,
      }),
      { name: 'Takeout/Keep/voice.json' },
    );
    archive.append(mp3, { name: 'Takeout/Keep/memo.mp3' });
    archive.append(
      JSON.stringify({
        title: `Trashed with pic ${Date.now()}`,
        textContent: 'bye',
        isTrashed: true,
        attachments: [{ filePath: 'trashed-pic.png', mimetype: 'image/png' }],
        createdTimestampUsec: Date.now() * 1000 + 1,
      }),
      { name: 'Takeout/Keep/trashed-pic.json' },
    );
    archive.append(png, { name: 'Takeout/Keep/trashed-pic.png' });
    await archive.finalize();
    await once(out, 'close');

    const key = t.storage.newKey('zip');
    await t.storage.write('exports', key, fs.readFileSync(zipPath));
    const job = await createJob(t.db, userId, 'import', key);
    await runTakeoutImport(t.db, t.storage, job.id, NO_QUOTA);

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const notes = list.json() as FullNote[];

    const voice = notes.find((n) => n.title.startsWith('Voice memo'));
    expect(voice?.attachments).toHaveLength(1);
    expect(voice?.attachments[0]).toMatchObject({
      kind: 'audio',
      mime: 'audio/mpeg',
      hasThumb: false,
    });

    const file = await t.app.inject({
      method: 'GET',
      url: `/api/attachments/${voice!.attachments[0]!.id}/file`,
      headers: { cookie },
    });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('audio/mpeg');
    expect(file.rawPayload.subarray(0, 3).toString()).toBe('ID3');

    const found = await t.app.inject({
      method: 'GET',
      url: '/api/search?type=audio',
      headers: { cookie },
    });
    expect((found.json() as FullNote[]).some((n) => n.id === voice!.id)).toBe(true);

    // Media attached to notes imported as trashed survives for restore.
    const trashed = notes.find((n) => n.title.startsWith('Trashed with pic'));
    expect(trashed?.trashedAt).not.toBeNull();
    expect(trashed?.attachments).toHaveLength(1);
    expect(trashed?.attachments[0]).toMatchObject({ kind: 'image' });
  });

  it('captures a version snapshot at import', async () => {
    const zipDir = `${process.env.TMPDIR ?? '/tmp'}/openkeep-test-takeout`;
    fs.mkdirSync(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, `takeout-version-${Date.now()}.zip`);
    const out = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 1 } });
    archive.pipe(out);
    const title = `Versioned import ${Date.now()}`;
    archive.append(
      JSON.stringify({
        title,
        textContent: 'as imported',
        createdTimestampUsec: Date.now() * 1000,
      }),
      { name: 'Takeout/Keep/versioned.json' },
    );
    await archive.finalize();
    await once(out, 'close');

    const key = t.storage.newKey('zip');
    await t.storage.write('exports', key, fs.readFileSync(zipPath));
    const job = await createJob(t.db, userId, 'import', key);
    await runTakeoutImport(t.db, t.storage, job.id, NO_QUOTA);

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const note = (list.json() as FullNote[]).find((n) => n.title === title);
    const versions = await t.app.inject({
      method: 'GET',
      url: `/api/notes/${note!.id}/versions`,
      headers: { cookie },
    });
    expect(versions.statusCode).toBe(200);
    expect(versions.json().length).toBe(1);
  });

  it('accepts archives beyond the 10 MB image cap (dedicated import limit)', async () => {
    const zipDir = `${process.env.TMPDIR ?? '/tmp'}/openkeep-test-takeout`;
    fs.mkdirSync(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, `takeout-big-${Date.now()}.zip`);
    const out = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ store: true });
    archive.pipe(out);
    const title = `Big archive note ${Date.now()}`;
    archive.append(
      JSON.stringify({ title, textContent: 'big', createdTimestampUsec: Date.now() * 1000 }),
      { name: 'Takeout/Keep/big.json' },
    );
    // Unreferenced, incompressible media entry pushes the zip past 10 MB.
    archive.append(randomBytes(11 * 1024 * 1024), { name: 'Takeout/Keep/pad.png' });
    await archive.finalize();
    await once(out, 'close');
    const zipBuffer = fs.readFileSync(zipPath);
    expect(zipBuffer.length).toBeGreaterThan(10 * 1024 * 1024);

    const boundary = '----okbig';
    const upload = await t.app.inject({
      method: 'POST',
      url: '/api/import/takeout',
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="takeout.zip"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        zipBuffer,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
    expect(upload.statusCode).toBe(202);

    await runTakeoutImport(t.db, t.storage, upload.json().jobId, NO_QUOTA);
    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    expect((list.json() as FullNote[]).some((n) => n.title === title)).toBe(true);
  });
});

/** Multipart body with one part per `.md` file, like the browser sends. */
function markdownMultipart(files: { name: string; text: string }[]) {
  const boundary = `----okmd${Math.random().toString(36).slice(2)}`;
  const parts = files.map((file) =>
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\n` +
        `Content-Type: text/markdown\r\n\r\n${file.text}\r\n`,
    ),
  );
  return {
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('markdown import & export', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('md@example.com', 'MD');
  });
  afterAll(async () => {
    await t.close();
  });

  const importMarkdown = async (files: { name: string; text: string }[]) => {
    const { payload, headers } = markdownMultipart(files);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/import/markdown',
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { imported: number; skipped: number };
  };

  const notesOf = async () =>
    (
      await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } })
    ).json() as FullNote[];

  it('imports .md files: heading title, formatting, front matter, task lists', async () => {
    const result = await importMarkdown([
      {
        name: 'ignored-name.md',
        text: '---\nlabels: [Vault, work]\ncolor: mint\npinned: true\n---\n\n# From heading\n\nsome **bold** and `code`\n\n- one\n- two\n',
      },
      { name: 'my-todo_list.md', text: '- [ ] milk\n  - [x] bread\n' },
    ]);
    expect(result).toEqual({ imported: 2, skipped: 0 });

    const notes = await notesOf();
    const rich = notes.find((n) => n.title === 'From heading');
    expect(rich?.bodyHtml).toBe(
      '<p>some <strong>bold</strong> and <code>code</code></p><ul><li>one</li><li>two</li></ul>',
    );
    expect(rich?.color).toBe('mint');
    expect(rich?.pinned).toBe(true);
    expect(rich?.labelIds).toHaveLength(2);

    // No heading → the file name becomes the title, and an all-task file is
    // a checklist note rather than a body full of literal boxes.
    const todo = notes.find((n) => n.title === 'my todo list');
    expect(todo?.type).toBe('list');
    expect(
      todo?.items.map((i) => ({ text: i.text, checked: i.checked, indent: i.indent })),
    ).toEqual([
      { text: 'milk', checked: false, indent: 0 },
      { text: 'bread', checked: true, indent: 1 },
    ]);
  });

  it('skips a re-import of the same file and rejects non-markdown uploads', async () => {
    const file = { name: 'again.md', text: '# Again\n\nbody\n' };
    expect(await importMarkdown([file])).toEqual({ imported: 1, skipped: 0 });
    expect(await importMarkdown([file])).toEqual({ imported: 0, skipped: 1 });

    const { payload, headers } = markdownMultipart([{ name: 'photo.png', text: 'nope' }]);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/import/markdown',
      headers: { ...headers, cookie },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it('imports a markdown vault zip through the archive job, skipping tool folders', async () => {
    const zipPath = path.join(
      t.storage.pathFor('exports', ''),
      `vault-${randomBytes(4).toString('hex')}.zip`,
    );
    const out = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 1 } });
    archive.pipe(out);
    archive.append('# Vault note\n\nfrom a zip\n', { name: 'vault/notes/vault-note.md' });
    archive.append('# Hidden\n\nno\n', { name: 'vault/.obsidian/plugin.md' });
    await archive.finalize();
    await once(out, 'close');

    const upload = await t.app.inject({
      method: 'POST',
      url: '/api/import/takeout',
      headers: {
        cookie,
        'content-type': 'multipart/form-data; boundary=b',
      },
      payload: Buffer.concat([
        Buffer.from(
          '--b\r\nContent-Disposition: form-data; name="file"; filename="vault.zip"\r\nContent-Type: application/zip\r\n\r\n',
        ),
        await fsp.readFile(zipPath),
        Buffer.from('\r\n--b--\r\n'),
      ]),
    });
    expect(upload.statusCode).toBe(202);
    await runTakeoutImport(t.db, t.storage, upload.json().jobId, NO_QUOTA);

    const notes = await notesOf();
    expect(notes.some((n) => n.title === 'Vault note')).toBe(true);
    expect(notes.some((n) => n.title === 'Hidden')).toBe(false);
    await fsp.rm(zipPath, { force: true });
  });

  it('writes a markdown copy of every note into the export zip', async () => {
    const start = await t.app.inject({ method: 'POST', url: '/api/export', headers: { cookie } });
    const { jobId } = start.json();
    await runExport(t.db, t.storage, jobId);

    const [job] = await t.db.select().from(userJobs).where(eq(userJobs.id, jobId));
    const entries = await new Promise<Map<string, string>>((resolve, reject) => {
      const found = new Map<string, string>();
      yauzl.open(t.storage.pathFor('exports', job!.fileKey!), { lazyEntries: true }, (err, zip) => {
        if (err || !zip) return reject(err);
        zip.on('entry', (entry) => {
          if (!entry.fileName.startsWith('markdown/')) return zip.readEntry();
          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) return zip.readEntry();
            const chunks: Buffer[] = [];
            stream.on('data', (c: Buffer) => chunks.push(c));
            stream.on('end', () => {
              found.set(entry.fileName, Buffer.concat(chunks).toString('utf8'));
              zip.readEntry();
            });
          });
        });
        zip.on('end', () => resolve(found));
        zip.readEntry();
      });
    });

    const rich = [...entries].find(([name]) => name.includes('From heading'));
    expect(rich).toBeDefined();
    expect(rich?.[1]).toContain('labels: [');
    expect(rich?.[1]).toContain('# From heading');
    expect(rich?.[1]).toContain('some **bold** and `code`');
  });
});

describe('storage cleanup job', () => {
  let t: TestApp;
  let cookie: string;
  let userId: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('cleanup@example.com', 'Cleanup');
    const session = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie },
    });
    userId = session.json().user.id;
  });
  afterAll(async () => {
    await t.close();
  });

  const backdate = async (area: 'attachments' | 'thumbs' | 'exports', key: string) => {
    const old = new Date(Date.now() - 25 * 3600 * 1000);
    await fsp.utimes(t.storage.pathFor(area, key), old, old);
  };

  it('removes expired export zips (24h TTL)', async () => {
    const start = await t.app.inject({ method: 'POST', url: '/api/export', headers: { cookie } });
    const { jobId } = start.json();
    await runExport(t.db, t.storage, jobId);
    const [job] = await t.db.select().from(userJobs).where(eq(userJobs.id, jobId));
    expect(job?.fileKey).not.toBeNull();
    expect(await t.storage.exists('exports', job!.fileKey!)).toBe(true);

    await t.db
      .update(userJobs)
      .set({ expiresAt: new Date(Date.now() - 3600 * 1000) })
      .where(eq(userJobs.id, jobId));
    const removed = await cleanupExpiredExports(t.db, t.storage);
    expect(removed).toBe(1);
    expect(await t.storage.exists('exports', job!.fileKey!)).toBe(false);
    const [after] = await t.db.select().from(userJobs).where(eq(userJobs.id, jobId));
    expect(after?.fileKey).toBeNull();
  });

  it('fails abandoned imports and releases their zips', async () => {
    const key = t.storage.newKey('zip');
    await t.storage.write('exports', key, Buffer.from('PK\x03\x04stub'));
    const job = await createJob(t.db, userId, 'import', key);
    await t.db
      .update(userJobs)
      .set({ createdAt: new Date(Date.now() - 25 * 3600 * 1000) })
      .where(eq(userJobs.id, job.id));

    const stale = await cleanupStaleImports(t.db, t.storage);
    expect(stale).toBe(1);
    const [after] = await t.db.select().from(userJobs).where(eq(userJobs.id, job.id));
    expect(after).toMatchObject({ status: 'failed', fileKey: null });
    expect(await t.storage.exists('exports', key)).toBe(false);
  });

  it('reconciles disk vs rows: old orphans removed, fresh and referenced files kept', async () => {
    // Referenced file: a real attachment upload.
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 9, g: 9, b: 9 } },
    })
      .png()
      .toBuffer();
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title: 'with file' },
    });
    const noteId = created.json().id;
    const boundary = '----okrec';
    const uploaded = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/attachments`,
      headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        png,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    });
    expect(uploaded.statusCode).toBe(201);

    const referenced = (await t.storage.list('attachments')).map((f) => f.key);
    expect(referenced.length).toBeGreaterThan(0);
    for (const key of referenced) await backdate('attachments', key);

    const oldOrphan = t.storage.newKey('png');
    await t.storage.write('attachments', oldOrphan, Buffer.from('orphan'));
    await backdate('attachments', oldOrphan);
    const freshOrphan = t.storage.newKey('png');
    await t.storage.write('attachments', freshOrphan, Buffer.from('fresh'));

    const removed = await reconcileStorage(t.db, t.storage);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await t.storage.exists('attachments', oldOrphan)).toBe(false);
    expect(await t.storage.exists('attachments', freshOrphan)).toBe(true);
    for (const key of referenced) {
      expect(await t.storage.exists('attachments', key)).toBe(true);
    }
  });
});
