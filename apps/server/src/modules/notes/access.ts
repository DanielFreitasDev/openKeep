import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { noteMembers, notes } from '../../db/schema/notes.js';
import { errors } from '../../lib/errors.js';

export type MembershipRow = typeof noteMembers.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;

export interface NoteAccess {
  member: MembershipRow;
  note: NoteRow;
}

/** Works inside or outside a transaction (both expose the query builder). */
type Queryable = Pick<Db, 'select'>;

/**
 * Access levels, least to most demanding:
 *
 * - `member` — anyone on the note. Reads, plus everything that is PER-USER
 *   (pin, color, background, labels, reminder, board position): a viewer owns
 *   their own copy of that state by the definition of the model.
 * - `editor` — writes to the SHARED content: title, body, checklist items,
 *   attachments, note type, version restore.
 * - `owner` — the note's existence: trash, restore, delete, merge, sharing.
 */
export type AccessLevel = 'member' | 'editor' | 'owner';

/**
 * THE authz chokepoint. Non-members receive the same 404 as a missing note —
 * no existence oracle. A level they cannot meet yields 403 instead (they can
 * see the note, so hiding it would be pointless).
 */
export async function assertNoteAccess(
  db: Queryable,
  userId: string,
  noteId: string,
  level: AccessLevel = 'member',
): Promise<NoteAccess> {
  const rows = await db
    .select({ member: noteMembers, note: notes })
    .from(noteMembers)
    .innerJoin(notes, eq(notes.id, noteMembers.noteId))
    .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.userId, userId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw errors.notFound();
  const role = row.member.role;
  if (level === 'owner' && role !== 'owner') {
    throw errors.forbidden('Only the owner can do this');
  }
  if (level === 'editor' && role === 'viewer') throw errors.readOnlyNote();
  return row;
}

/** Trashed notes are read-only (409 note_trashed on any edit attempt). */
export function assertNotTrashed(note: NoteRow): void {
  if (note.trashedAt !== null) throw errors.noteTrashed();
}
