import fsp from 'node:fs/promises';
import path from 'node:path';
import { asc } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { user } from '../../db/schema/auth.js';
import type { Storage } from '../../lib/storage.js';
import { writeExportZip } from '../import-export/service.js';

/** `openkeep-20260731T031500Z.zip` — sortable as a plain string, no parsing. */
const FILE_RE = /^openkeep-\d{8}T\d{6}Z\.zip$/;

/**
 * Timestamp for a backup file name: the ISO instant with the separators the
 * file system dislikes removed, seconds resolution, always UTC. Lexicographic
 * order is chronological order, which is what the rotation below leans on.
 */
export function backupStamp(now: Date): string {
  return `${now.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/**
 * Keep the newest `keep` archives in `dir`, delete the rest, and report how
 * many went. Only files this job wrote are considered — anything else the
 * operator parked in the directory is none of our business.
 */
async function rotate(dir: string, keep: number): Promise<number> {
  const names = (await fsp.readdir(dir).catch(() => [] as string[]))
    .filter((name) => FILE_RE.test(name))
    .sort();
  const stale = names.slice(0, Math.max(0, names.length - keep));
  for (const name of stale) await fsp.rm(path.join(dir, name), { force: true });
  return stale.length;
}

export interface BackupResult {
  users: number;
  written: number;
  failed: number;
  removed: number;
}

/**
 * Scheduled backup: one export archive per account, under `<dir>/<userId>/`,
 * rotated to the newest `keep`.
 *
 * Per account rather than one archive for the instance because the export
 * *is* per account — same file the user downloads from Settings, so restoring
 * is the import flow that already exists rather than a second format nobody
 * tests. One account failing does not abort the run: the rest still get a
 * backup, and the caller logs the count.
 */
export async function runScheduledBackup(
  db: Db,
  storage: Storage,
  options: { dir: string; keep: number; now?: Date },
): Promise<BackupResult> {
  const now = options.now ?? new Date();
  const stamp = backupStamp(now);
  const users = await db.select({ id: user.id }).from(user).orderBy(asc(user.id));

  let written = 0;
  let failed = 0;
  let removed = 0;
  for (const row of users) {
    const dir = path.join(options.dir, row.id);
    const target = path.join(dir, `openkeep-${stamp}.zip`);
    try {
      await fsp.mkdir(dir, { recursive: true });
      // Written aside and renamed: a crash mid-archive must not leave a
      // truncated file that looks like a backup — and rotation only ever sees
      // finished ones, since `.part` does not match the name pattern.
      const part = `${target}.part`;
      await writeExportZip(db, storage, row.id, part);
      await fsp.rename(part, target);
      written++;
    } catch {
      failed++;
      await fsp.rm(`${target}.part`, { force: true }).catch(() => {});
      // A failed run must not rotate this account's good archives away.
      continue;
    }
    removed += await rotate(dir, options.keep);
  }

  return { users: users.length, written, failed, removed };
}
