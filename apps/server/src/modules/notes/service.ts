import type {
  CreateNote,
  FullNote,
  NoteContentResult,
  NoteStateResult,
  NoteVersionMeta,
  PatchNoteContent,
  PatchNoteState,
} from '@openkeep/shared';
import { comparePositions, LIMITS, positionBefore, positionsBetween } from '@openkeep/shared';
import { and, asc, desc, eq, inArray, isNotNull, lt, min } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { attachments as attachmentsTable } from '../../db/schema/attachments.js';
import { noteLabels } from '../../db/schema/labels.js';
import type { VersionItem } from '../../db/schema/notes.js';
import { noteItems, noteMembers, notes, noteVersions } from '../../db/schema/notes.js';
import { errors } from '../../lib/errors.js';
import {
  detectLinks,
  htmlToPlainText,
  plainTextToHtml,
  sanitizeNoteHtml,
} from '../../lib/sanitize.js';
import type { Storage } from '../../lib/storage.js';
import {
  attachmentKeysForNotes,
  copyAttachments,
  toAttachmentDto,
  unlinkAttachmentFiles,
} from '../attachments/service.js';
import type { MembershipRow, NoteRow } from './access.js';
import { assertNoteAccess, assertNotTrashed } from './access.js';

type ItemRow = typeof noteItems.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** A version snapshot marks an "editing session" boundary. */
const SESSION_BOUNDARY_MS = 10 * 60 * 1000;

/** Drizzle wraps pg errors; the SQLSTATE lives on the cause chain. */
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur instanceof Error; depth++) {
    if ((cur as { code?: string }).code === '23505') return true;
    cur = cur.cause;
  }
  return false;
}

// ---------------------------------------------------------------- assembly

type AttachmentRow = typeof attachmentsTable.$inferSelect;

function toFullNote(
  note: NoteRow,
  member: MembershipRow,
  items: ItemRow[],
  labelIds: string[] = [],
  attachmentRows: AttachmentRow[] = [],
): FullNote {
  return {
    id: note.id,
    type: note.type as FullNote['type'],
    title: note.title,
    bodyHtml: note.bodyHtml,
    hasLinks: note.hasLinks,
    items: items.map((i) => ({
      id: i.id,
      text: i.text,
      checked: i.checked,
      indent: (i.indent === 1 ? 1 : 0) as 0 | 1,
      position: i.position,
    })),
    labelIds,
    attachments: attachmentRows.map(toAttachmentDto),
    role: member.role as FullNote['role'],
    pinned: member.pinned,
    archived: member.archived,
    color: member.color as FullNote['color'],
    background: member.background as FullNote['background'],
    position: member.position,
    trashedAt: note.trashedAt ? note.trashedAt.toISOString() : null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

async function loadItems(db: Db | Tx, noteIds: string[]): Promise<Map<string, ItemRow[]>> {
  const map = new Map<string, ItemRow[]>();
  if (noteIds.length === 0) return map;
  const rows = await db
    .select()
    .from(noteItems)
    .where(inArray(noteItems.noteId, noteIds))
    .orderBy(asc(noteItems.position), asc(noteItems.id));
  for (const row of rows) {
    const list = map.get(row.noteId);
    if (list) list.push(row);
    else map.set(row.noteId, [row]);
  }
  return map;
}

async function loadLabelIds(
  db: Db | Tx,
  userId: string,
  noteIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (noteIds.length === 0) return map;
  const rows = await db
    .select({ noteId: noteLabels.noteId, labelId: noteLabels.labelId })
    .from(noteLabels)
    .where(and(eq(noteLabels.userId, userId), inArray(noteLabels.noteId, noteIds)));
  for (const row of rows) {
    const list = map.get(row.noteId);
    if (list) list.push(row.labelId);
    else map.set(row.noteId, [row.labelId]);
  }
  return map;
}

async function loadAttachments(
  db: Db | Tx,
  noteIds: string[],
): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (noteIds.length === 0) return map;
  const rows = await db
    .select()
    .from(attachmentsTable)
    .where(inArray(attachmentsTable.noteId, noteIds))
    .orderBy(asc(attachmentsTable.createdAt), asc(attachmentsTable.id));
  for (const row of rows) {
    const list = map.get(row.noteId);
    if (list) list.push(row);
    else map.set(row.noteId, [row]);
  }
  return map;
}

async function loadFullNote(db: Db | Tx, userId: string, noteId: string): Promise<FullNote> {
  const { member, note } = await assertNoteAccess(db as Db, userId, noteId);
  const items = (await loadItems(db, [noteId])).get(noteId) ?? [];
  const labelIds = (await loadLabelIds(db, userId, [noteId])).get(noteId) ?? [];
  const atts = (await loadAttachments(db, [noteId])).get(noteId) ?? [];
  return toFullNote(note, member, items, labelIds, atts);
}

/** Shared assembly for search & list: FullNotes for a set of note ids. */
export async function assembleFullNotes(
  db: Db,
  userId: string,
  rows: { member: MembershipRow; note: NoteRow }[],
): Promise<FullNote[]> {
  const ids = rows.map((r) => r.note.id);
  const itemsByNote = await loadItems(db, ids);
  const labelsByNote = await loadLabelIds(db, userId, ids);
  const attsByNote = await loadAttachments(db, ids);
  return rows.map(({ member, note }) =>
    toFullNote(
      note,
      member,
      itemsByNote.get(note.id) ?? [],
      labelsByNote.get(note.id) ?? [],
      attsByNote.get(note.id) ?? [],
    ),
  );
}

/** The whole corpus (active + archived + trashed) — one batched select per table. */
export async function listNotes(
  db: Db,
  userId: string,
  view?: 'active' | 'archived' | 'trash',
): Promise<FullNote[]> {
  const rows = await db
    .select({ member: noteMembers, note: notes })
    .from(noteMembers)
    .innerJoin(notes, eq(notes.id, noteMembers.noteId))
    .where(eq(noteMembers.userId, userId));

  const filtered = rows.filter(({ member, note }) => {
    const trashed = note.trashedAt !== null;
    if (view === 'trash') return trashed;
    if (view === 'archived') return !trashed && member.archived;
    if (view === 'active') return !trashed && !member.archived;
    return true;
  });

  return (await assembleFullNotes(db, userId, filtered)).sort(comparePositions);
}

// ---------------------------------------------------------------- helpers

function deriveContent(bodyHtmlRaw: string): {
  bodyHtml: string;
  bodyText: string;
  hasLinks: boolean;
} {
  const bodyHtml = sanitizeNoteHtml(bodyHtmlRaw);
  const bodyText = htmlToPlainText(bodyHtml);
  if (bodyText.length > LIMITS.noteBodyTextMax) {
    throw errors.badRequest(`Note text cannot exceed ${LIMITS.noteBodyTextMax} characters`);
  }
  return { bodyHtml, bodyText, hasLinks: detectLinks(bodyText) };
}

/** Globally-smallest position for this user → note appears at the top of its section. */
async function topPosition(db: Db | Tx, userId: string): Promise<string> {
  const [row] = await db
    .select({ min: min(noteMembers.position) })
    .from(noteMembers)
    .where(eq(noteMembers.userId, userId));
  return positionBefore(row?.min ?? null);
}

async function snapshotVersion(
  tx: Tx,
  note: NoteRow,
  items: ItemRow[],
  byUserId: string,
): Promise<void> {
  const versionItems: VersionItem[] | null =
    note.type === 'list'
      ? items.map((i) => ({ text: i.text, checked: i.checked, indent: i.indent }))
      : null;
  await tx.insert(noteVersions).values({
    noteId: note.id,
    title: note.title,
    bodyText: note.bodyText,
    items: versionItems,
    createdBy: byUserId,
  });
  // Prune beyond the cap (oldest first).
  const excess = await tx
    .select({ id: noteVersions.id })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, note.id))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
    .offset(LIMITS.versionsPerNoteMax);
  if (excess.length > 0) {
    await tx.delete(noteVersions).where(
      inArray(
        noteVersions.id,
        excess.map((e) => e.id),
      ),
    );
  }
}

/** Session-boundary capture: snapshot pre-edit state when a new "session" starts. */
async function maybeSnapshot(
  tx: Tx,
  note: NoteRow,
  byUserId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const isEmpty = note.title === '' && note.bodyText === '';
  const stale = Date.now() - note.updatedAt.getTime() > SESSION_BOUNDARY_MS;
  const editorChanged = note.lastEditedBy !== null && note.lastEditedBy !== byUserId;
  if (!opts.force && !stale && !editorChanged) return;
  if (isEmpty && note.type === 'text') return;
  const items = (await loadItems(tx, [note.id])).get(note.id) ?? [];
  await snapshotVersion(tx, note, items, byUserId);
}

// ---------------------------------------------------------------- mutations

export async function createNote(db: Db, userId: string, input: CreateNote): Promise<FullNote> {
  const { bodyHtml, bodyText, hasLinks } = deriveContent(input.bodyHtml);

  return db.transaction(async (tx) => {
    const position = await topPosition(tx, userId);
    let noteRow: NoteRow;
    try {
      const inserted = await tx
        .insert(notes)
        .values({
          ...(input.id ? { id: input.id } : {}),
          ownerId: userId,
          type: input.type,
          title: input.title,
          bodyHtml,
          bodyText,
          hasLinks,
          lastEditedBy: userId,
        })
        .returning();
      noteRow = inserted[0]!;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw errors.conflict('conflict', 'A note with this id already exists');
      }
      throw err;
    }

    const [memberRow] = await tx
      .insert(noteMembers)
      .values({
        noteId: noteRow.id,
        userId,
        role: 'owner',
        pinned: input.pinned,
        color: input.color,
        background: input.background,
        position,
      })
      .returning();

    let itemRows: ItemRow[] = [];
    if (input.items.length > 0) {
      const positions = positionsBetween(null, null, input.items.length);
      itemRows = await tx
        .insert(noteItems)
        .values(
          input.items.map((item, i) => ({
            noteId: noteRow.id,
            text: item.text,
            checked: item.checked,
            indent: item.indent,
            position: positions[i]!,
          })),
        )
        .returning();
    }

    return toFullNote(noteRow, memberRow!, itemRows, []);
  });
}

export async function patchNoteContent(
  db: Db,
  userId: string,
  noteId: string,
  patch: PatchNoteContent,
): Promise<NoteContentResult> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId);
    assertNotTrashed(note);
    await maybeSnapshot(tx, note, userId);

    const update: Partial<typeof notes.$inferInsert> = { lastEditedBy: userId };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.bodyHtml !== undefined) {
      Object.assign(update, deriveContent(patch.bodyHtml));
    }

    const [updated] = await tx.update(notes).set(update).where(eq(notes.id, noteId)).returning();
    const u = updated!;
    return {
      id: u.id,
      title: u.title,
      bodyHtml: u.bodyHtml,
      hasLinks: u.hasLinks,
      updatedAt: u.updatedAt.toISOString(),
    };
  });
}

export async function patchNoteState(
  db: Db,
  userId: string,
  noteId: string,
  patch: PatchNoteState,
): Promise<NoteStateResult> {
  const { note } = await assertNoteAccess(db, userId, noteId);
  assertNotTrashed(note);

  const [updated] = await db
    .update(noteMembers)
    .set(patch)
    .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.userId, userId)))
    .returning();
  const m = updated!;
  return {
    id: noteId,
    pinned: m.pinned,
    archived: m.archived,
    color: m.color as NoteStateResult['color'],
    background: m.background as NoteStateResult['background'],
    position: m.position,
  };
}

export async function trashNote(db: Db, userId: string, noteId: string): Promise<FullNote> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'owner');
    if (note.trashedAt === null) {
      await tx.update(notes).set({ trashedAt: new Date() }).where(eq(notes.id, noteId));
      // Keep parity: trashing unpins for everyone; restore goes to OTHERS.
      await tx.update(noteMembers).set({ pinned: false }).where(eq(noteMembers.noteId, noteId));
    }
    return loadFullNote(tx, userId, noteId);
  });
}

export async function restoreNote(db: Db, userId: string, noteId: string): Promise<FullNote> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'owner');
    if (note.trashedAt !== null) {
      await tx.update(notes).set({ trashedAt: null }).where(eq(notes.id, noteId));
    }
    return loadFullNote(tx, userId, noteId);
  });
}

export async function deleteNoteForever(
  db: Db,
  userId: string,
  noteId: string,
  storage?: Storage,
): Promise<void> {
  const { note } = await assertNoteAccess(db, userId, noteId, 'owner');
  if (note.trashedAt === null) {
    throw errors.conflict('conflict', 'Only trashed notes can be deleted forever');
  }
  const keys = await attachmentKeysForNotes(db, [noteId]);
  await db.delete(notes).where(eq(notes.id, noteId));
  if (storage) await unlinkAttachmentFiles(storage, keys);
}

export async function emptyTrash(db: Db, userId: string, storage?: Storage): Promise<number> {
  const trashedIds = (
    await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.ownerId, userId), isNotNull(notes.trashedAt)))
  ).map((r) => r.id);
  if (trashedIds.length === 0) return 0;
  const keys = await attachmentKeysForNotes(db, trashedIds);
  const deleted = await db
    .delete(notes)
    .where(inArray(notes.id, trashedIds))
    .returning({ id: notes.id });
  if (storage) await unlinkAttachmentFiles(storage, keys);
  return deleted.length;
}

export async function copyNote(
  db: Db,
  userId: string,
  noteId: string,
  storage?: Storage,
): Promise<FullNote> {
  return db.transaction(async (tx) => {
    const { member, note } = await assertNoteAccess(tx as unknown as Db, userId, noteId);
    assertNotTrashed(note);
    const items = (await loadItems(tx, [noteId])).get(noteId) ?? [];

    const [newNote] = await tx
      .insert(notes)
      .values({
        ownerId: userId,
        type: note.type,
        title: note.title,
        bodyHtml: note.bodyHtml,
        bodyText: note.bodyText,
        hasLinks: note.hasLinks,
        lastEditedBy: userId,
      })
      .returning();

    const position = await topPosition(tx, userId);
    // Copies content, color and background — not pin/collaborators/reminders.
    const [newMember] = await tx
      .insert(noteMembers)
      .values({
        noteId: newNote!.id,
        userId,
        role: 'owner',
        color: member.color,
        background: member.background,
        position,
      })
      .returning();

    let newItems: ItemRow[] = [];
    if (items.length > 0) {
      newItems = await tx
        .insert(noteItems)
        .values(
          items.map((i) => ({
            noteId: newNote!.id,
            text: i.text,
            checked: i.checked,
            indent: i.indent,
            position: i.position,
          })),
        )
        .returning();
    }

    // "Make a copy" clones MY labels (not collaborators/reminders/pin).
    const myLabels = (await loadLabelIds(tx, userId, [noteId])).get(noteId) ?? [];
    if (myLabels.length > 0) {
      await tx
        .insert(noteLabels)
        .values(myLabels.map((labelId) => ({ noteId: newNote!.id, userId, labelId })));
    }

    // Attachment files are duplicated too (Keep parity).
    if (storage) {
      await copyAttachments(tx as unknown as Db, storage, noteId, newNote!.id);
    }
    const newAtts = (await loadAttachments(tx, [newNote!.id])).get(newNote!.id) ?? [];

    return toFullNote(newNote!, newMember!, newItems, myLabels, newAtts);
  });
}

export async function convertNote(
  db: Db,
  userId: string,
  noteId: string,
  to: 'text' | 'list',
): Promise<FullNote> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId);
    assertNotTrashed(note);
    if (note.type === to) return loadFullNote(tx, userId, noteId);

    await maybeSnapshot(tx, note, userId, { force: true });

    if (to === 'list') {
      // Body lines become unchecked items; body clears.
      const lines = note.bodyText.split('\n').filter((l) => l.trim() !== '');
      if (lines.length > 0) {
        const positions = positionsBetween(null, null, lines.length);
        await tx.insert(noteItems).values(
          lines.map((text, i) => ({
            noteId,
            text: text.slice(0, LIMITS.itemTextMax),
            position: positions[i]!,
          })),
        );
      }
      await tx
        .update(notes)
        .set({ type: 'list', bodyHtml: '', bodyText: '', hasLinks: false, lastEditedBy: userId })
        .where(eq(notes.id, noteId));
    } else {
      // Items join into body lines; check state drops (Keep parity).
      const items = (await loadItems(tx, [noteId])).get(noteId) ?? [];
      const bodyText = items
        .map((i) => i.text)
        .filter((t) => t !== '')
        .join('\n');
      await tx.delete(noteItems).where(eq(noteItems.noteId, noteId));
      await tx
        .update(notes)
        .set({
          type: 'text',
          bodyHtml: plainTextToHtml(bodyText),
          bodyText,
          hasLinks: detectLinks(bodyText),
          lastEditedBy: userId,
        })
        .where(eq(notes.id, noteId));
    }

    return loadFullNote(tx, userId, noteId);
  });
}

// ---------------------------------------------------------------- versions

export async function listVersions(
  db: Db,
  userId: string,
  noteId: string,
): Promise<NoteVersionMeta[]> {
  await assertNoteAccess(db, userId, noteId);
  const rows = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id));
  return rows.map((v) => ({
    id: v.id,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy,
  }));
}

export async function versionAsText(
  db: Db,
  userId: string,
  noteId: string,
  versionId: string,
): Promise<{ filename: string; content: string }> {
  await assertNoteAccess(db, userId, noteId);
  const [v] = await db
    .select()
    .from(noteVersions)
    .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)))
    .limit(1);
  if (!v) throw errors.notFound();

  const body = v.items
    ? v.items
        .map((i) => `${i.indent === 1 ? '  ' : ''}[${i.checked ? 'x' : ' '}] ${i.text}`)
        .join('\n')
    : v.bodyText;
  const content = v.title ? `${v.title}\n\n${body}` : body;
  const stamp = v.createdAt.toISOString().slice(0, 10);
  const namePart =
    (v.title || 'note')
      .slice(0, 40)
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim() || 'note';
  return { filename: `${namePart}-${stamp}.txt`, content };
}

export async function restoreVersion(
  db: Db,
  userId: string,
  noteId: string,
  versionId: string,
): Promise<FullNote> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId);
    assertNotTrashed(note);
    const [v] = await tx
      .select()
      .from(noteVersions)
      .where(and(eq(noteVersions.id, versionId), eq(noteVersions.noteId, noteId)))
      .limit(1);
    if (!v) throw errors.notFound();

    // Snapshot the current state first, so restore itself is undoable.
    await maybeSnapshot(tx, note, userId, { force: true });

    await tx.delete(noteItems).where(eq(noteItems.noteId, noteId));
    if (v.items) {
      if (v.items.length > 0) {
        const positions = positionsBetween(null, null, v.items.length);
        await tx.insert(noteItems).values(
          v.items.map((item, i) => ({
            noteId,
            text: item.text,
            checked: item.checked,
            indent: item.indent === 1 ? 1 : 0,
            position: positions[i]!,
          })),
        );
      }
      await tx
        .update(notes)
        .set({
          type: 'list',
          title: v.title,
          bodyHtml: '',
          bodyText: '',
          hasLinks: false,
          lastEditedBy: userId,
        })
        .where(eq(notes.id, noteId));
    } else {
      await tx
        .update(notes)
        .set({
          type: 'text',
          title: v.title,
          bodyHtml: plainTextToHtml(v.bodyText),
          bodyText: v.bodyText,
          hasLinks: detectLinks(v.bodyText),
          lastEditedBy: userId,
        })
        .where(eq(notes.id, noteId));
    }

    return loadFullNote(tx, userId, noteId);
  });
}

// ---------------------------------------------------------------- purge

/** pg-boss `purge-trash` handler body (invoked directly in tests with a fake clock). */
export async function purgeExpiredTrash(
  db: Db,
  now: Date = new Date(),
  storage?: Storage,
): Promise<number> {
  const cutoff = new Date(now.getTime() - LIMITS.trashRetentionDays * 24 * 60 * 60 * 1000);
  const expiredIds = (
    await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(isNotNull(notes.trashedAt), lt(notes.trashedAt, cutoff)))
  ).map((r) => r.id);
  if (expiredIds.length === 0) return 0;
  const keys = await attachmentKeysForNotes(db, expiredIds);
  const deleted = await db
    .delete(notes)
    .where(inArray(notes.id, expiredIds))
    .returning({ id: notes.id });
  if (storage) await unlinkAttachmentFiles(storage, keys);
  return deleted.length;
}
