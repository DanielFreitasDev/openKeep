import { randomBytes } from 'node:crypto';
import type { Collaborator, InviteRole, NoteColor, PublicNote } from '@openkeep/shared';
import { LIMITS, positionBefore } from '@openkeep/shared';
import { and, asc, count, eq, min, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { attachments } from '../../db/schema/attachments.js';
import { user } from '../../db/schema/auth.js';
import { noteItems, noteMembers, notes } from '../../db/schema/notes.js';
import { reminders } from '../../db/schema/reminders.js';
import { userSettings } from '../../db/schema/settings.js';
import { noteShareLinks } from '../../db/schema/sharing.js';
import { AppError, errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import type { AttachmentFile } from '../attachments/service.js';
import { streamAttachment, toAttachmentDto } from '../attachments/service.js';
import { assertNoteAccess, assertNotTrashed } from '../notes/access.js';

export async function listCollaborators(
  db: Db,
  userId: string,
  noteId: string,
): Promise<Collaborator[]> {
  await assertNoteAccess(db, userId, noteId);
  const rows = await db
    .select({
      userId: noteMembers.userId,
      role: noteMembers.role,
      email: user.email,
      name: user.name,
    })
    .from(noteMembers)
    .innerJoin(user, eq(user.id, noteMembers.userId))
    .where(eq(noteMembers.noteId, noteId));
  return rows
    .map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      role: r.role as Collaborator['role'],
    }))
    .sort((a) => (a.role === 'owner' ? -1 : 1));
}

async function sharingEnabledFor(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: userSettings.sharingEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return row?.enabled ?? true;
}

/** Owner invites a registered user by email, as editor (default) or viewer. */
export async function addCollaborator(
  db: Db,
  ownerId: string,
  noteId: string,
  email: string,
  role: InviteRole = 'collaborator',
): Promise<Collaborator> {
  await assertNoteAccess(db, ownerId, noteId, 'owner');

  if (!(await sharingEnabledFor(db, ownerId))) {
    throw new AppError(403, 'sharing_disabled', 'Sharing is disabled in your settings');
  }

  const [target] = await db
    .select()
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);
  if (!target) {
    throw new AppError(
      404,
      'collaborator_not_registered',
      'No OpenKeep account with this email',
      'The person must have an account on this instance first.',
    );
  }
  if (target.id === ownerId) {
    throw errors.badRequest('You already own this note');
  }
  if (!(await sharingEnabledFor(db, target.id))) {
    throw new AppError(
      403,
      'sharing_disabled_for_target',
      'This person is not accepting shared notes',
    );
  }

  return db.transaction(async (tx) => {
    const [countRow] = await tx
      .select({ n: count() })
      .from(noteMembers)
      .where(eq(noteMembers.noteId, noteId));
    if ((countRow?.n ?? 0) >= LIMITS.collaboratorsPerNoteMax + 1) {
      throw new AppError(400, 'collaborator_limit_reached', 'Collaborator limit reached');
    }

    const [existing] = await tx
      .select()
      .from(noteMembers)
      .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.userId, target.id)));
    if (existing) {
      throw new AppError(409, 'already_collaborator', 'Already a collaborator');
    }

    // The note appears at the top of the target's board.
    const [minRow] = await tx
      .select({ min: min(noteMembers.position) })
      .from(noteMembers)
      .where(eq(noteMembers.userId, target.id));

    await tx.insert(noteMembers).values({
      noteId,
      userId: target.id,
      role,
      position: positionBefore(minRow?.min ?? null),
    });

    return { userId: target.id, email: target.email, name: target.name, role };
  });
}

/**
 * Owner flips an existing member between editor and viewer. The owner's own
 * row is untouchable — a note without an owner has nobody who can delete it.
 */
export async function setCollaboratorRole(
  db: Db,
  ownerId: string,
  noteId: string,
  targetUserId: string,
  role: InviteRole,
): Promise<Collaborator> {
  await assertNoteAccess(db, ownerId, noteId, 'owner');
  if (targetUserId === ownerId) throw errors.badRequest('The owner keeps their own permission');

  const [updated] = await db
    .update(noteMembers)
    .set({ role })
    .where(
      and(
        eq(noteMembers.noteId, noteId),
        eq(noteMembers.userId, targetUserId),
        ne(noteMembers.role, 'owner'),
      ),
    )
    .returning({ userId: noteMembers.userId, role: noteMembers.role });
  if (!updated) throw errors.notFound();

  const [target] = await db.select().from(user).where(eq(user.id, targetUserId)).limit(1);
  return {
    userId: updated.userId,
    email: target?.email ?? '',
    name: target?.name ?? '',
    role: updated.role as Collaborator['role'],
  };
}

/**
 * Remove: owner removes anyone (except themself via this route);
 * a collaborator may remove only themself (leave).
 */
export async function removeCollaborator(
  db: Db,
  actorId: string,
  noteId: string,
  targetUserId: string,
): Promise<'removed' | 'left'> {
  const { member } = await assertNoteAccess(db, actorId, noteId);

  const isSelf = actorId === targetUserId;
  if (member.role !== 'owner' && !isSelf) {
    throw errors.forbidden('Only the owner can remove other people');
  }
  if (member.role === 'owner' && isSelf) {
    throw errors.badRequest('The owner cannot leave their own note');
  }

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(noteMembers)
      .where(
        and(
          eq(noteMembers.noteId, noteId),
          eq(noteMembers.userId, targetUserId),
          // Any non-owner row: editor or viewer. The owner is removed with the note.
          ne(noteMembers.role, 'owner'),
        ),
      )
      .returning({ userId: noteMembers.userId });
    if (deleted.length === 0) throw errors.notFound();
    // note_labels cascade via the composite FK; the reminder is per-user data.
    await tx
      .delete(reminders)
      .where(and(eq(reminders.noteId, noteId), eq(reminders.userId, targetUserId)));
    return isSelf ? 'left' : 'removed';
  });
}

/* ------------------------------------------------------------------ *
 * Public read-only links
 * ------------------------------------------------------------------ */

/** 24 random bytes, base64url — 192 bits of address that has to be guessed. */
const TOKEN_BYTES = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ShareLinkRow = typeof noteShareLinks.$inferSelect;

/** Handing the note to people with no account is the owner's call alone. */
export async function getShareLink(
  db: Db,
  userId: string,
  noteId: string,
): Promise<ShareLinkRow | null> {
  await assertNoteAccess(db, userId, noteId, 'owner');
  const [row] = await db
    .select()
    .from(noteShareLinks)
    .where(eq(noteShareLinks.noteId, noteId))
    .limit(1);
  return row ?? null;
}

/**
 * Issue (or re-issue) the link. Re-issuing overwrites the row, so the previous
 * address dies in the same breath — "regenerate" and "revoke" are the same
 * guarantee, and there is never a second live address to keep track of.
 */
export async function createShareLink(
  db: Db,
  userId: string,
  noteId: string,
  expiresInDays: number | null,
): Promise<ShareLinkRow> {
  const { note } = await assertNoteAccess(db, userId, noteId, 'owner');
  assertNotTrashed(note);
  if (!(await sharingEnabledFor(db, userId))) {
    throw new AppError(403, 'sharing_disabled', 'Sharing is disabled in your settings');
  }

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = expiresInDays === null ? null : new Date(Date.now() + expiresInDays * DAY_MS);
  const [row] = await db
    .insert(noteShareLinks)
    .values({ noteId, token, createdBy: userId, expiresAt })
    .onConflictDoUpdate({
      target: noteShareLinks.noteId,
      set: { token, createdBy: userId, expiresAt, createdAt: new Date() },
    })
    .returning();
  if (!row) throw errors.internal('Could not create the link');
  return row;
}

export async function revokeShareLink(db: Db, userId: string, noteId: string): Promise<void> {
  await assertNoteAccess(db, userId, noteId, 'owner');
  await db.delete(noteShareLinks).where(eq(noteShareLinks.noteId, noteId));
}

/**
 * The token → note resolution every public route starts from. A link that
 * expired, or whose note went to the trash, resolves to nothing — the same
 * nothing an invented token resolves to, so the 404 is never an oracle.
 * Trashing is reversible, and so is this: restoring the note revives the link.
 */
async function noteIdForToken(db: Db, token: string, now: Date): Promise<string | null> {
  const [row] = await db
    .select({
      noteId: noteShareLinks.noteId,
      expiresAt: noteShareLinks.expiresAt,
      trashedAt: notes.trashedAt,
    })
    .from(noteShareLinks)
    .innerJoin(notes, eq(notes.id, noteShareLinks.noteId))
    .where(eq(noteShareLinks.token, token))
    .limit(1);
  if (!row || row.trashedAt !== null) return null;
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) return null;
  return row.noteId;
}

export async function publicNoteByToken(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<PublicNote | null> {
  const noteId = await noteIdForToken(db, token, now);
  if (noteId === null) return null;

  const [row] = await db
    .select({ note: notes, color: noteMembers.color })
    .from(notes)
    .innerJoin(noteMembers, and(eq(noteMembers.noteId, notes.id), eq(noteMembers.role, 'owner')))
    .where(eq(notes.id, noteId))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select()
    .from(noteItems)
    .where(eq(noteItems.noteId, noteId))
    .orderBy(asc(noteItems.position), asc(noteItems.id));
  const atts = await db
    .select()
    .from(attachments)
    .where(eq(attachments.noteId, noteId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));

  return {
    type: row.note.type as PublicNote['type'],
    title: row.note.title,
    bodyHtml: row.note.bodyHtml,
    items: items.map((i) => ({
      id: i.id,
      text: i.text,
      checked: i.checked,
      indent: i.indent as 0 | 1,
      position: i.position,
    })),
    attachments: atts.map(toAttachmentDto),
    color: row.color as NoteColor,
    createdAt: row.note.createdAt.toISOString(),
    updatedAt: row.note.updatedAt.toISOString(),
  };
}

/**
 * Attachment bytes for a link holder. The token scopes the lookup to its own
 * note, so an id from a different note is a 404 rather than a leak — which is
 * what a signed URL would have bought, without a second secret to manage.
 */
export async function openPublicAttachment(
  db: Db,
  storage: Storage,
  token: string,
  attachmentId: string,
  variant: 'file' | 'thumb',
): Promise<AttachmentFile> {
  const noteId = await noteIdForToken(db, token, new Date());
  if (noteId === null) throw errors.notFound();
  const [att] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.noteId, noteId)))
    .limit(1);
  if (!att) throw errors.notFound();
  return streamAttachment(storage, att, variant);
}
