import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import {
  LIMITS,
  markdownFileName,
  metaBackground,
  metaColor,
  noteToMarkdown,
  parseMarkdownNote,
  positionAfter,
  positionsBetween,
} from '@openkeep/shared';
import { ZipArchive } from 'archiver';
import { and, count, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import yauzl from 'yauzl';
import type { Db } from '../../db/client.js';
import { attachments as attachmentsTable } from '../../db/schema/attachments.js';
import { userJobs } from '../../db/schema/jobs.js';
import { labels as labelsTable, noteLabels } from '../../db/schema/labels.js';
import { noteItems, noteMembers, notes } from '../../db/schema/notes.js';
import { errors } from '../../lib/errors.js';
import {
  detectLinks,
  htmlToPlainText,
  plainTextToHtml,
  sanitizeNoteHtml,
} from '../../lib/sanitize.js';
import type { Storage } from '../../lib/storage.js';
import { importMediaAttachment } from '../attachments/service.js';
import { listLabels } from '../labels/service.js';
import { listNotes, snapshotVersion } from '../notes/service.js';
import { getSettings } from '../settings/service.js';
import { type ParsedTakeoutNote, parseTakeoutNote } from './takeout.js';

export type JobRow = typeof userJobs.$inferSelect;

export async function createJob(
  db: Db,
  userId: string,
  kind: 'import' | 'export',
  fileKey?: string,
): Promise<JobRow> {
  const [job] = await db
    .insert(userJobs)
    .values({ userId, kind, ...(fileKey ? { fileKey } : {}) })
    .returning();
  return job!;
}

export async function getJob(db: Db, userId: string, jobId: string): Promise<JobRow> {
  const [job] = await db
    .select()
    .from(userJobs)
    .where(and(eq(userJobs.id, jobId), eq(userJobs.userId, userId)))
    .limit(1);
  if (!job) throw errors.notFound();
  return job;
}

async function updateJob(db: Db, jobId: string, patch: Partial<typeof userJobs.$inferInsert>) {
  await db.update(userJobs).set(patch).where(eq(userJobs.id, jobId));
}

// ---------------------------------------------------------------- import

interface ImportZip {
  notes: { fileName: string; parsed: ParsedTakeoutNote }[];
  /** Markdown entries, read on demand — a vault can hold thousands of files. */
  markdown: { fileName: string; read: () => Promise<string | null> }[];
  /** Random-access read of one media entry by base name (null if absent/corrupt). */
  readMedia: (baseName: string) => Promise<Buffer | null>;
  close: () => void;
}

/** `.obsidian/`, `.git/`, `__MACOSX/` — tool state, never notes. */
function isToolFolder(name: string): boolean {
  return name.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');
}

function bufferEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer | null> {
  return new Promise((resolve) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return resolve(null);
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', () => resolve(null));
    });
  });
}

/**
 * Scans the zip once: JSON notes are parsed eagerly (small), media and
 * markdown entries are only indexed — bodies are read on demand per note, so
 * neither a photo-heavy Takeout nor a thousand-file vault sits fully in memory.
 *
 * One reader for both shapes because one archive can hold both, and because a
 * markdown vault is otherwise the same job: entries in, notes out.
 */
async function openImportZip(path: string): Promise<ImportZip> {
  const parsedNotes: { fileName: string; parsed: ParsedTakeoutNote }[] = [];
  const markdownEntries: { fileName: string; entry: yauzl.Entry }[] = [];
  const mediaEntries = new Map<string, yauzl.Entry>();

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zf) =>
      err ? reject(err) : resolve(zf),
    );
  });

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const name = entry.fileName;
      const isJson = name.toLowerCase().endsWith('.json');
      const isMarkdown = /\.(md|markdown)$/i.test(name);
      const isMedia = /\.(jpe?g|png|gif|webp|3gp|m4a|mp3|ogg|aac|amr|wav)$/i.test(name);
      const skip =
        entry.uncompressedSize > 30 * 1024 * 1024 ||
        (!isJson && !isMarkdown && !isMedia) ||
        isToolFolder(name);
      if (skip) {
        zip.readEntry();
        return;
      }
      if (isMarkdown) {
        markdownEntries.push({ fileName: name, entry });
        zip.readEntry();
        return;
      }
      if (!isJson) {
        mediaEntries.set(name.split('/').pop() ?? name, entry);
        zip.readEntry();
        return;
      }
      void bufferEntry(zip, entry).then((buffer) => {
        if (buffer) {
          try {
            const parsed = parseTakeoutNote(JSON.parse(buffer.toString('utf8')));
            if (parsed) parsedNotes.push({ fileName: name, parsed });
          } catch {
            // not a Keep note — skip
          }
        }
        zip.readEntry();
      });
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });

  return {
    notes: parsedNotes,
    markdown: markdownEntries.map(({ fileName, entry }) => ({
      fileName,
      read: async () => (await bufferEntry(zip, entry))?.toString('utf8') ?? null,
    })),
    readMedia: (baseName) => {
      const entry = mediaEntries.get(baseName);
      return entry ? bufferEntry(zip, entry) : Promise.resolve(null);
    },
    close: () => zip.close(),
  };
}

/**
 * pg-boss `import-takeout` handler body — Takeout archives and markdown
 * vaults alike (the queue name predates the second shape; renaming it would
 * strand anything already queued).
 */
export async function runTakeoutImport(
  db: Db,
  storage: Storage,
  jobId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const [job] = await db.select().from(userJobs).where(eq(userJobs.id, jobId)).limit(1);
  if (job?.kind !== 'import' || !job.fileKey) return;
  const userId = job.userId;

  await updateJob(db, jobId, { status: 'running' });
  let zip: ImportZip | null = null;
  try {
    zip = await openImportZip(storage.pathFor('exports', job.fileKey));
    const entries = zip.notes;
    const markdownEntries = zip.markdown;
    const total = entries.length + markdownEntries.length;
    await updateJob(db, jobId, { total });

    let done = 0;
    let imported = 0;
    let skipped = 0;
    // Sharing is never re-created on import; count it so the report can say so.
    let shared = 0;

    const tick = async () => {
      done++;
      if (done % 5 === 0 || done === total) {
        await updateJob(db, jobId, { progress: done });
        onProgress?.(done, total);
      }
    };

    for (const { parsed } of entries) {
      const outcome = await importOneNote(db, storage, userId, parsed, zip.readMedia);
      if (outcome === 'imported') imported++;
      else skipped++;
      if (parsed.wasShared) shared++;
      await tick();
    }

    for (const entry of markdownEntries) {
      const text = await entry.read();
      const outcome =
        text === null
          ? 'skipped'
          : await importMarkdownNote(db, userId, entry.fileName, text).catch(() => 'skipped');
      if (outcome === 'imported') imported++;
      else skipped++;
      await tick();
    }

    await updateJob(db, jobId, {
      status: 'done',
      progress: done,
      finishedAt: new Date(),
      summary: JSON.stringify({ imported, skipped, shared }),
      fileKey: null,
    });
  } catch (err) {
    await updateJob(db, jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message.slice(0, 500) : 'import failed',
      finishedAt: new Date(),
      fileKey: null,
    });
  } finally {
    zip?.close();
    await storage.remove('exports', job.fileKey);
  }
}

/** Find-or-create per name, respecting the 50 cap (over-cap labels are dropped). */
async function attachLabels(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  userId: string,
  noteId: string,
  names: string[],
): Promise<void> {
  for (const labelName of names) {
    const [existingLabel] = await tx
      .select()
      .from(labelsTable)
      .where(
        and(
          eq(labelsTable.userId, userId),
          sql`lower(${labelsTable.name}) = ${labelName.toLowerCase()}`,
        ),
      )
      .limit(1);
    let labelId = existingLabel?.id;
    if (!labelId) {
      const [countRow] = await tx
        .select({ n: count() })
        .from(labelsTable)
        .where(eq(labelsTable.userId, userId));
      if ((countRow?.n ?? 0) >= LIMITS.labelsPerUserMax) continue;
      // Imported labels append to the manual order, like hand-made ones.
      const [last] = await tx
        .select({ position: labelsTable.position })
        .from(labelsTable)
        .where(eq(labelsTable.userId, userId))
        .orderBy(desc(labelsTable.position))
        .limit(1);
      const [created] = await tx
        .insert(labelsTable)
        .values({
          userId,
          name: labelName.slice(0, LIMITS.labelNameMax),
          position: positionAfter(last?.position ?? null),
        })
        .onConflictDoNothing()
        .returning();
      labelId = created?.id;
    }
    if (labelId) {
      await tx.insert(noteLabels).values({ noteId, userId, labelId }).onConflictDoNothing();
    }
  }
}

async function importOneNote(
  db: Db,
  storage: Storage,
  userId: string,
  parsed: ParsedTakeoutNote,
  readMedia: (baseName: string) => Promise<Buffer | null>,
): Promise<'imported' | 'skipped'> {
  // Idempotency: (owner_id, imported_fingerprint) partial unique index.
  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.ownerId, userId), eq(notes.importedFingerprint, parsed.fingerprint)))
    .limit(1);
  if (existing.length > 0) return 'skipped';

  const bodyHtml =
    parsed.type === 'text' && parsed.bodyText ? plainTextToHtml(parsed.bodyText) : '';

  const noteId = await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(notes)
      .values({
        ownerId: userId,
        type: parsed.type,
        title: parsed.title,
        bodyHtml,
        bodyText: parsed.type === 'text' ? parsed.bodyText : '',
        hasLinks: detectLinks(parsed.bodyText),
        importedFingerprint: parsed.fingerprint,
        // isTrashed restarts the 7-day clock from import time.
        trashedAt: parsed.trashed ? new Date() : null,
        lastEditedBy: userId,
        ...(parsed.createdAt ? { createdAt: parsed.createdAt } : {}),
        ...(parsed.editedAt ? { updatedAt: parsed.editedAt } : {}),
      })
      .returning();

    // Imported notes land at the BOTTOM of the board (Keep-like backfill).
    const [maxRow] = await tx
      .select({ position: noteMembers.position })
      .from(noteMembers)
      .where(eq(noteMembers.userId, userId))
      .orderBy(desc(noteMembers.position))
      .limit(1);
    await tx.insert(noteMembers).values({
      noteId: note!.id,
      userId,
      role: 'owner',
      pinned: parsed.pinned && !parsed.trashed,
      archived: parsed.archived && !parsed.trashed,
      color: parsed.color,
      position: positionAfter(maxRow?.position ?? null),
    });

    if (parsed.items.length > 0) {
      const positions = positionsBetween(null, null, parsed.items.length);
      await tx.insert(noteItems).values(
        parsed.items.map((item, i) => ({
          noteId: note!.id,
          text: item.text,
          checked: item.checked,
          position: positions[i]!,
        })),
      );
    }

    await attachLabels(tx, userId, note!.id, parsed.labels);

    // Version capture "at import": the arriving content is the first snapshot.
    if (parsed.title !== '' || parsed.bodyText !== '' || parsed.items.length > 0) {
      await snapshotVersion(
        tx,
        note!,
        parsed.items.map((i) => ({ text: i.text, checked: i.checked, indent: 0 })),
        userId,
      );
    }

    return note!.id;
  });

  // Attachments outside the tx (sharp + file IO). Images and audio both
  // ingest; unrecognized/corrupt media is skipped.
  for (const att of parsed.attachmentPaths.slice(0, LIMITS.attachmentsPerNoteMax)) {
    const base = att.filePath.split('/').pop() ?? att.filePath;
    const buffer = await readMedia(base);
    if (!buffer) continue;
    await importMediaAttachment(db, storage, userId, noteId, buffer).catch(() => {
      // corrupt / unsupported media — skip
    });
  }

  return 'imported';
}

// ------------------------------------------------------- markdown import

/** Body html that respects both caps, degrading to plain text if it has to. */
function fitBody(html: string): { bodyHtml: string; bodyText: string } {
  let bodyHtml = sanitizeNoteHtml(html);
  let bodyText = htmlToPlainText(bodyHtml);
  while (bodyText.length > LIMITS.noteBodyTextMax || bodyHtml.length > LIMITS.noteBodyHtmlMax) {
    bodyText = bodyText.slice(0, Math.min(LIMITS.noteBodyTextMax, Math.floor(bodyText.length / 2)));
    bodyHtml = plainTextToHtml(bodyText);
  }
  return { bodyHtml, bodyText };
}

const isoDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * One `.md` file → one note. Used by the zip job (a whole vault) and by the
 * direct upload route (a handful of files), so the two paths cannot drift.
 *
 * The fingerprint covers the file name and its bytes, which makes re-importing
 * an unchanged vault a no-op — the same promise the Takeout import makes — and
 * still lets an edited file come in as a new note.
 */
export async function importMarkdownNote(
  db: Db,
  userId: string,
  fileName: string,
  text: string,
): Promise<'imported' | 'skipped'> {
  const baseName = fileName.split('/').pop() ?? fileName;
  const parsed = parseMarkdownNote(text, baseName);
  if (parsed.title === '' && parsed.bodyHtml === '' && parsed.items.length === 0) return 'skipped';

  const fingerprint = createHash('sha256').update(`markdown\0${baseName}\0${text}`).digest('hex');
  const existing = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.ownerId, userId), eq(notes.importedFingerprint, fingerprint)))
    .limit(1);
  if (existing.length > 0) return 'skipped';

  const { bodyHtml, bodyText } =
    parsed.type === 'text' ? fitBody(parsed.bodyHtml) : { bodyHtml: '', bodyText: '' };
  const { meta } = parsed;
  const createdAt = isoDate(meta.created);
  const updatedAt = isoDate(meta.updated);
  const items = parsed.items.slice(0, LIMITS.itemsPerNoteMax);

  await db.transaction(async (tx) => {
    const [note] = await tx
      .insert(notes)
      .values({
        ownerId: userId,
        type: parsed.type,
        title: parsed.title,
        bodyHtml,
        bodyText,
        hasLinks: detectLinks(bodyText) || bodyHtml.includes('<a href='),
        importedFingerprint: fingerprint,
        lastEditedBy: userId,
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {}),
      })
      .returning();

    const [maxRow] = await tx
      .select({ position: noteMembers.position })
      .from(noteMembers)
      .where(eq(noteMembers.userId, userId))
      .orderBy(desc(noteMembers.position))
      .limit(1);
    await tx.insert(noteMembers).values({
      noteId: note!.id,
      userId,
      role: 'owner',
      pinned: meta.pinned === true,
      archived: meta.archived === true,
      color: metaColor(meta),
      background: metaBackground(meta),
      position: positionAfter(maxRow?.position ?? null),
    });

    if (items.length > 0) {
      const positions = positionsBetween(null, null, items.length);
      await tx.insert(noteItems).values(
        items.map((item, i) => ({
          noteId: note!.id,
          text: item.text,
          checked: item.checked,
          indent: item.indent,
          position: positions[i]!,
        })),
      );
    }

    await attachLabels(tx, userId, note!.id, meta.labels ?? []);
    await snapshotVersion(tx, note!, items, userId);
  });

  return 'imported';
}

/** Direct `.md` upload (no zip): small batches import inline, in order. */
export async function importMarkdownFiles(
  db: Db,
  userId: string,
  files: { fileName: string; text: string }[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (const file of files) {
    const outcome = await importMarkdownNote(db, userId, file.fileName, file.text).catch(
      () => 'skipped' as const,
    );
    if (outcome === 'imported') imported++;
    else skipped++;
  }
  return { imported, skipped };
}

// ---------------------------------------------------------------- export

/**
 * Write one account's complete export archive to `outPath`. Shared by the
 * on-demand export job and the scheduled backup, so a backup is byte-for-byte
 * the same thing the user can download from Settings — one format to restore.
 */
export async function writeExportZip(
  db: Db,
  storage: Storage,
  userId: string,
  outPath: string,
): Promise<{ notes: number; labels: number }> {
  const output = fs.createWriteStream(outPath);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.pipe(output);

  const allNotes = await listNotes(db, userId);
  const allLabels = await listLabels(db, userId);
  const settings = await getSettings(db, userId);

  archive.append(
    JSON.stringify({ app: 'OpenKeep', version: 1, exportedAt: new Date().toISOString() }, null, 2),
    { name: 'manifest.json' },
  );
  archive.append(JSON.stringify(allNotes, null, 2), { name: 'notes.json' });
  archive.append(JSON.stringify(allLabels, null, 2), { name: 'labels.json' });
  archive.append(JSON.stringify(settings, null, 2), { name: 'settings.json' });

  // A second, human-readable copy of every note. notes.json is the exact
  // backup; markdown/ is what opens in Obsidian, Joplin or any editor — and
  // what /api/import/markdown reads back, front matter and all.
  const labelNames = new Map(allLabels.map((label) => [label.id, label.name]));
  const usedNames = new Set<string>();
  for (const note of allNotes) {
    const markdown = noteToMarkdown(note, {
      labels: note.labelIds
        .map((id) => labelNames.get(id))
        .filter((name): name is string => name !== undefined),
      color: note.color,
      background: note.background,
      pinned: note.pinned,
      archived: note.archived,
      created: note.createdAt,
      updated: note.updatedAt,
    });
    if (markdown.trim() === '') continue;
    // The id suffix already makes names unique; this only guards a zip entry
    // colliding after the title was flattened for the file system.
    let name = markdownFileName(note.title, note.id);
    while (usedNames.has(name)) name = `_${name}`;
    usedNames.add(name);
    archive.append(markdown, { name: `markdown/${note.trashedAt ? 'trash/' : ''}${name}` });
  }

  for (const note of allNotes) {
    for (const att of note.attachments) {
      const [row] = await db
        .select({ storageKey: attachmentsTable.storageKey })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.id, att.id))
        .limit(1);
      if (row && (await storage.exists('attachments', row.storageKey))) {
        archive.file(storage.pathFor('attachments', row.storageKey), {
          name: `attachments/${note.id}/${row.storageKey}`,
        });
      }
    }
  }

  await archive.finalize();
  await once(output, 'close');
  return { notes: allNotes.length, labels: allLabels.length };
}

/** pg-boss `export-user-data` handler body. */
export async function runExport(db: Db, storage: Storage, jobId: string): Promise<void> {
  const [job] = await db.select().from(userJobs).where(eq(userJobs.id, jobId)).limit(1);
  if (job?.kind !== 'export') return;

  await updateJob(db, jobId, { status: 'running' });
  try {
    const fileKey = storage.newKey('zip');
    const summary = await writeExportZip(
      db,
      storage,
      job.userId,
      storage.pathFor('exports', fileKey),
    );
    await updateJob(db, jobId, {
      status: 'done',
      fileKey,
      finishedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      summary: JSON.stringify(summary),
    });
  } catch (err) {
    await updateJob(db, jobId, {
      status: 'failed',
      error: err instanceof Error ? err.message.slice(0, 500) : 'export failed',
      finishedAt: new Date(),
    });
  }
}

/** Daily cleanup: expired export zips (24h TTL). */
export async function cleanupExpiredExports(
  db: Db,
  storage: Storage,
  now = new Date(),
): Promise<number> {
  const expired = await db
    .select()
    .from(userJobs)
    .where(
      and(eq(userJobs.kind, 'export'), eq(userJobs.status, 'done'), lt(userJobs.expiresAt, now)),
    );
  for (const job of expired) {
    if (job.fileKey) await storage.remove('exports', job.fileKey);
    await updateJob(db, job.id, { fileKey: null });
  }
  return expired.length;
}

/**
 * Crash recovery: imports stuck pending/running for >24h (worker died) are
 * failed and their zips released so the reconcile below can collect them.
 */
export async function cleanupStaleImports(
  db: Db,
  storage: Storage,
  now = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);
  const stale = await db
    .select()
    .from(userJobs)
    .where(
      and(
        eq(userJobs.kind, 'import'),
        inArray(userJobs.status, ['pending', 'running']),
        lt(userJobs.createdAt, cutoff),
      ),
    );
  for (const job of stale) {
    if (job.fileKey) await storage.remove('exports', job.fileKey);
    await updateJob(db, job.id, {
      status: 'failed',
      error: 'import abandoned (worker restart)',
      finishedAt: now,
      fileKey: null,
    });
  }
  return stale.length;
}

/**
 * Disk ↔ rows reconcile: unlink files no row references (crashed uploads,
 * failed unlinks). A 24h mtime grace keeps in-flight writes safe.
 */
export async function reconcileStorage(
  db: Db,
  storage: Storage,
  now = new Date(),
): Promise<number> {
  const graceMs = 24 * 3600 * 1000;
  const known: Record<'attachments' | 'thumbs' | 'exports', Set<string>> = {
    attachments: new Set(),
    thumbs: new Set(),
    exports: new Set(),
  };
  const attRows = await db
    .select({ storageKey: attachmentsTable.storageKey, thumbKey: attachmentsTable.thumbKey })
    .from(attachmentsTable);
  for (const row of attRows) {
    known.attachments.add(row.storageKey);
    if (row.thumbKey) known.thumbs.add(row.thumbKey);
  }
  const jobRows = await db
    .select({ fileKey: userJobs.fileKey })
    .from(userJobs)
    .where(isNotNull(userJobs.fileKey));
  for (const row of jobRows) {
    if (row.fileKey) known.exports.add(row.fileKey);
  }

  let removed = 0;
  for (const area of ['attachments', 'thumbs', 'exports'] as const) {
    for (const file of await storage.list(area)) {
      if (!known[area].has(file.key) && now.getTime() - file.mtimeMs > graceMs) {
        await storage.remove(area, file.key);
        removed++;
      }
    }
  }
  return removed;
}
