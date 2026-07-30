import type {
  Collaborator,
  CreateNote,
  FullNote,
  NoteContentResult,
  NoteStateResult,
  NoteVersionMeta,
  PatchNoteContent,
  PatchNoteState,
} from '@openkeep/shared';
import { comparePositions, LIMITS, positionBefore, positionsBetween } from '@openkeep/shared';
import { and, asc, desc, eq, exists, inArray, isNotNull, lt, min, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { attachments as attachmentsTable } from '../../db/schema/attachments.js';
import { user as userTable } from '../../db/schema/auth.js';
import { labels as labelsTable, noteLabels } from '../../db/schema/labels.js';
import type { VersionItem } from '../../db/schema/notes.js';
import { noteItems, noteMembers, notes, noteVersions } from '../../db/schema/notes.js';
import { reminders as remindersTable } from '../../db/schema/reminders.js';
import { errors } from '../../lib/errors.js';
import {
  detectLinks,
  htmlToMarkdown,
  htmlToPlainText,
  renderMarkdown,
  sanitizeNoteHtml,
} from '../../lib/sanitize.js';
import type { Storage } from '../../lib/storage.js';
import {
  attachmentKeysForNotes,
  copyAttachments,
  toAttachmentDto,
  unlinkAttachmentFiles,
} from '../attachments/service.js';
import { toReminderDto } from '../reminders/service.js';
import type { MembershipRow, NoteRow } from './access.js';
import { assertNoteAccess, assertNotTrashed } from './access.js';

type ItemRow = typeof noteItems.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * A version snapshot marks an "editing session" boundary: this much idle time
 * (no edits at all) between two edits starts a new session, so reopening a note
 * later and typing again lands in the history as its own entry.
 */
const SESSION_BOUNDARY_MS = 30 * 1000;

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
type ReminderRow = typeof remindersTable.$inferSelect;

function toFullNote(
  note: NoteRow,
  member: MembershipRow,
  items: ItemRow[],
  labelIds: string[] = [],
  attachmentRows: AttachmentRow[] = [],
  reminder: ReminderRow | null = null,
  collaborators: Collaborator[] = [],
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
    reminder: reminder ? toReminderDto(reminder) : null,
    collaborators,
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

async function loadCollaborators(
  db: Db | Tx,
  noteIds: string[],
): Promise<Map<string, Collaborator[]>> {
  const map = new Map<string, Collaborator[]>();
  if (noteIds.length === 0) return map;
  const rows = await db
    .select({
      noteId: noteMembers.noteId,
      userId: noteMembers.userId,
      role: noteMembers.role,
      email: userTable.email,
      name: userTable.name,
    })
    .from(noteMembers)
    .innerJoin(userTable, eq(userTable.id, noteMembers.userId))
    .where(inArray(noteMembers.noteId, noteIds));
  for (const row of rows) {
    const c: Collaborator = {
      userId: row.userId,
      email: row.email,
      name: row.name,
      role: row.role as Collaborator['role'],
    };
    const list = map.get(row.noteId);
    if (list) list.push(c);
    else map.set(row.noteId, [c]);
  }
  return map;
}

async function loadReminders(
  db: Db | Tx,
  userId: string,
  noteIds: string[],
): Promise<Map<string, ReminderRow>> {
  const map = new Map<string, ReminderRow>();
  if (noteIds.length === 0) return map;
  const rows = await db
    .select()
    .from(remindersTable)
    .where(and(eq(remindersTable.userId, userId), inArray(remindersTable.noteId, noteIds)));
  for (const row of rows) map.set(row.noteId, row);
  return map;
}

async function loadFullNote(db: Db | Tx, userId: string, noteId: string): Promise<FullNote> {
  const { member, note } = await assertNoteAccess(db as Db, userId, noteId);
  const items = (await loadItems(db, [noteId])).get(noteId) ?? [];
  const labelIds = (await loadLabelIds(db, userId, [noteId])).get(noteId) ?? [];
  const atts = (await loadAttachments(db, [noteId])).get(noteId) ?? [];
  const rem = (await loadReminders(db, userId, [noteId])).get(noteId) ?? null;
  const collabs = (await loadCollaborators(db, [noteId])).get(noteId) ?? [];
  return toFullNote(note, member, items, labelIds, atts, rem, collabs);
}

/** Single FullNote for a user; 404 (no oracle) when they have no membership. */
export async function getNote(db: Db, userId: string, noteId: string): Promise<FullNote> {
  return loadFullNote(db, userId, noteId);
}

/** Single FullNote for a user, or null when they have no membership. */
export async function assembleForUser(
  db: Db,
  userId: string,
  noteId: string,
): Promise<FullNote | null> {
  try {
    return await loadFullNote(db, userId, noteId);
  } catch {
    return null;
  }
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
  const remByNote = await loadReminders(db, userId, ids);
  const collabsByNote = await loadCollaborators(db, ids);
  return rows.map(({ member, note }) =>
    toFullNote(
      note,
      member,
      itemsByNote.get(note.id) ?? [],
      labelsByNote.get(note.id) ?? [],
      attsByNote.get(note.id) ?? [],
      remByNote.get(note.id) ?? null,
      collabsByNote.get(note.id) ?? [],
    ),
  );
}

/** The whole corpus (active + archived + trashed) — one batched select per table. */
export async function listNotes(
  db: Db,
  userId: string,
  view?: 'active' | 'archived' | 'trash',
  label?: string,
): Promise<FullNote[]> {
  const conditions = [eq(noteMembers.userId, userId)];
  if (label) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(noteLabels)
          .innerJoin(labelsTable, eq(labelsTable.id, noteLabels.labelId))
          .where(
            and(
              eq(noteLabels.noteId, noteMembers.noteId),
              eq(noteLabels.userId, userId),
              sql`lower(${labelsTable.name}) = lower(${label})`,
            ),
          ),
      ),
    );
  }
  const rows = await db
    .select({ member: noteMembers, note: notes })
    .from(noteMembers)
    .innerJoin(notes, eq(notes.id, noteMembers.noteId))
    .where(and(...conditions));

  const filtered = rows.filter(({ member, note }) => {
    const trashed = note.trashedAt !== null;
    // Keep parity: only the owner sees a trashed shared note (in their trash).
    if (trashed && member.role !== 'owner') return false;
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

export async function snapshotVersion(
  tx: Tx,
  note: NoteRow,
  items: Pick<ItemRow, 'text' | 'checked' | 'indent'>[],
  byUserId: string,
): Promise<void> {
  const versionItems: VersionItem[] | null =
    note.type === 'list'
      ? items.map((i) => ({ text: i.text, checked: i.checked, indent: i.indent }))
      : null;
  await tx.insert(noteVersions).values({
    noteId: note.id,
    title: note.title,
    bodyText: versionBody(note),
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

/**
 * What a version stores for the body: markdown, not plain text.
 *
 * Snapshots used to keep `bodyText`, so restoring a formatted note handed back
 * flat paragraphs — the history quietly destroyed the formatting it was meant
 * to protect. Markdown is the note vocabulary written down, so a restore is
 * lossless, and the stored text stays readable in the download.
 */
function versionBody(note: NoteRow): string {
  return note.type === 'list' ? '' : htmlToMarkdown(note.bodyHtml);
}

/** Two snapshots are the same version when title, body and items all match. */
function sameContent(
  a: { title: string; bodyText: string; items: VersionItem[] | null },
  b: { title: string; bodyText: string; items: VersionItem[] | null },
): boolean {
  return (
    a.title === b.title &&
    a.bodyText === b.bodyText &&
    JSON.stringify(a.items ?? null) === JSON.stringify(b.items ?? null)
  );
}

/**
 * Session-boundary capture: snapshot the pre-edit state when a new "session"
 * starts — the note has been idle for a while, another collaborator took over,
 * or nothing has ever been captured for it (so the first edit preserves the
 * note as it was created). Snapshots identical to the newest one are skipped,
 * which is what keeps the 500 ms autosave from filling the history with noise.
 */
export async function maybeSnapshot(
  tx: Tx,
  note: NoteRow,
  byUserId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const items = (await loadItems(tx, [note.id])).get(note.id) ?? [];
  const candidate = {
    title: note.title,
    bodyText: versionBody(note),
    items: (note.type === 'list'
      ? items.map((i) => ({ text: i.text, checked: i.checked, indent: i.indent }))
      : null) as VersionItem[] | null,
  };
  const isEmpty =
    candidate.title === '' &&
    candidate.bodyText === '' &&
    !candidate.items?.some((i) => i.text !== '');
  if (isEmpty) return;

  const [newest] = await tx
    .select({
      title: noteVersions.title,
      bodyText: noteVersions.bodyText,
      items: noteVersions.items,
      createdAt: noteVersions.createdAt,
    })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, note.id))
    .orderBy(desc(noteVersions.createdAt), desc(noteVersions.id))
    .limit(1);

  if (newest && sameContent(newest, candidate)) return;

  const stale = Date.now() - note.updatedAt.getTime() > SESSION_BOUNDARY_MS;
  const editorChanged = note.lastEditedBy !== null && note.lastEditedBy !== byUserId;
  if (!opts.force && newest && !stale && !editorChanged) return;

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

    const selfCollabs = (await loadCollaborators(tx, [noteRow.id])).get(noteRow.id) ?? [];
    return toFullNote(noteRow, memberRow!, itemRows, [], [], null, selfCollabs);
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
    const selfCollabs = (await loadCollaborators(tx, [newNote!.id])).get(newNote!.id) ?? [];

    return toFullNote(newNote!, newMember!, newItems, myLabels, newAtts, null, selfCollabs);
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
      // Body lines become items. A body that already holds a markdown list
      // converts marker for marker — bullets, nesting and `[x]` boxes — so
      // ticking checkboxes on a list you wrote by hand keeps its structure.
      const lines = note.bodyText.split('\n').filter((l) => l.trim() !== '');
      const parsed = lines.map((line) => {
        const marker = /^(\s*)(?:[-*+]|\d{1,9}[.)])[ \t]+(.*)$/.exec(line);
        const indent = marker ? Math.min(1, Math.floor(marker[1]!.length / 2)) : 0;
        const rest = marker ? (marker[2] ?? '') : line.trim();
        const box = /^\[([ xX])\][ \t]*(.*)$/.exec(rest);
        return {
          text: (box ? (box[2] ?? '') : rest).slice(0, LIMITS.itemTextMax),
          checked: box ? (box[1] ?? ' ').toLowerCase() === 'x' : false,
          indent: (marker ? indent : 0) as 0 | 1,
        };
      });
      if (parsed.length > 0) {
        const positions = positionsBetween(null, null, parsed.length);
        await tx.insert(noteItems).values(
          parsed.map((item, i) => ({
            noteId,
            text: item.text,
            checked: item.checked,
            indent: item.indent,
            position: positions[i]!,
          })),
        );
      }
      await tx
        .update(notes)
        .set({ type: 'list', bodyHtml: '', bodyText: '', hasLinks: false, lastEditedBy: userId })
        .where(eq(notes.id, noteId));
    } else {
      // Items become a bullet list, which is now something the body can hold —
      // structure and indent survive the trip. Check state still drops (Keep
      // parity), and converting back re-reads the bullets as items.
      const items = (await loadItems(tx, [noteId])).get(noteId) ?? [];
      const markdown = items
        .filter((i) => i.text !== '')
        .map((i) => `${i.indent === 1 ? '  ' : ''}- ${i.text}`)
        .join('\n');
      const { bodyHtml, bodyText, hasLinks } = deriveContent(renderMarkdown(markdown));
      await tx.delete(noteItems).where(eq(noteItems.noteId, noteId));
      await tx
        .update(notes)
        .set({ type: 'text', bodyHtml, bodyText, hasLinks, lastEditedBy: userId })
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

export async function versionAsMarkdown(
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

  // Markdown, matching the note's own `.md` download: task items for a
  // checklist, the stored markdown body for a text note.
  const body = v.items
    ? v.items
        .map((i) => `${i.indent === 1 ? '  ' : ''}- [${i.checked ? 'x' : ' '}] ${i.text}`)
        .join('\n')
    : v.bodyText;
  const content = `${v.title ? `# ${v.title}\n\n` : ''}${body}\n`;
  const stamp = v.createdAt.toISOString().slice(0, 10);
  const namePart =
    (v.title || 'note')
      .slice(0, 40)
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .trim() || 'note';
  return { filename: `${namePart}-${stamp}.md`, content };
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
          // Versions hold markdown, so the formatting comes back with the text.
          ...deriveContent(renderMarkdown(v.bodyText)),
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
  retentionDays: number = LIMITS.trashRetentionDays,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
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
