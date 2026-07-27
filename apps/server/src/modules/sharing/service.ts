import type { Collaborator } from '@openkeep/shared';
import { LIMITS, positionBefore } from '@openkeep/shared';
import { and, count, eq, min } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { user } from '../../db/schema/auth.js';
import { noteMembers } from '../../db/schema/notes.js';
import { reminders } from '../../db/schema/reminders.js';
import { userSettings } from '../../db/schema/settings.js';
import { AppError, errors } from '../../lib/errors.js';
import { assertNoteAccess } from '../notes/access.js';

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

/** Owner invites a registered user by email. */
export async function addCollaborator(
  db: Db,
  ownerId: string,
  noteId: string,
  email: string,
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
      role: 'collaborator',
      position: positionBefore(minRow?.min ?? null),
    });

    return { userId: target.id, email: target.email, name: target.name, role: 'collaborator' };
  });
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
          eq(noteMembers.role, 'collaborator'),
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
