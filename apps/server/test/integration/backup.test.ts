import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { backupStamp, runScheduledBackup } from '../../src/modules/backup/service.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

/** Entry names inside a zip, so the archive can be checked without unpacking. */
function zipEntries(file: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const names: string[] = [];
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('cannot open zip'));
      zip.on('entry', (entry: yauzl.Entry) => {
        names.push(entry.fileName);
        zip.readEntry();
      });
      zip.on('end', () => resolve(names));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

describe('scheduled backup', () => {
  let t: TestApp;
  let mine: string;
  let dir: string;

  beforeAll(async () => {
    t = await createTestApp();
    mine = await t.signUp('backup-owner@example.com', 'Owner');
    await t.signUp('backup-other@example.com', 'Other');
    dir = path.join(os.tmpdir(), `openkeep-backup-${randomUUID()}`);
  });
  afterAll(async () => {
    await t.close();
    await fsp.rm(dir, { recursive: true, force: true });
  });

  const run = (now: Date, keep = 2) => runScheduledBackup(t.db, t.storage, { dir, keep, now });
  const listDirs = async () => (await fsp.readdir(dir)).sort();
  const listFiles = async (userDir: string) => (await fsp.readdir(path.join(dir, userDir))).sort();

  it('writes one archive per account, holding the same export the user can download', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie: mine },
      payload: { title: 'Backed up', bodyHtml: '<p>hello</p>' },
    });
    expect(created.statusCode).toBe(201);
    const note = created.json() as FullNote;

    const result = await run(new Date('2026-07-29T03:00:00Z'));
    expect(result).toMatchObject({ users: 2, written: 2, failed: 0, removed: 0 });

    const userDirs = await listDirs();
    expect(userDirs).toHaveLength(2);

    // The account that owns the note must have it in its archive, in both the
    // exact (notes.json) and the human-readable (markdown/) form.
    let found = false;
    for (const userDir of userDirs) {
      const files = await listFiles(userDir);
      expect(files).toEqual(['openkeep-20260729T030000Z.zip']);
      const entries = await zipEntries(path.join(dir, userDir, files[0] as string));
      expect(entries).toContain('notes.json');
      expect(entries).toContain('manifest.json');
      if (entries.includes(`markdown/Backed up-${note.id.slice(0, 8)}.md`)) found = true;
    }
    expect(found).toBe(true);
  });

  it('rotates to the newest N and leaves no half-written file behind', async () => {
    await run(new Date('2026-07-30T03:00:00Z'));
    const third = await run(new Date('2026-07-31T03:00:00Z'));
    expect(third.removed).toBe(2); // one per account

    for (const userDir of await listDirs()) {
      expect(await listFiles(userDir)).toEqual([
        'openkeep-20260730T030000Z.zip',
        'openkeep-20260731T030000Z.zip',
      ]);
    }
  });

  it('stamps file names so that string order is chronological order', () => {
    expect(backupStamp(new Date('2026-07-31T03:05:09.999Z'))).toBe('20260731T030509Z');
    expect(
      backupStamp(new Date('2026-01-02T00:00:00Z')) < backupStamp(new Date('2026-10-02T00:00:00Z')),
    ).toBe(true);
  });
});
