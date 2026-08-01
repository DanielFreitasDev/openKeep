import type { AdminOverview, AdminUserPage, DeleteUserResult } from '@openkeep/shared';
import { APP_VERSION } from '@openkeep/shared';
import { asc, count, eq, ilike, inArray, or, sum } from 'drizzle-orm';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { attachments } from '../../db/schema/attachments.js';
import { user as userTable } from '../../db/schema/auth.js';
import { instanceSettings } from '../../db/schema/instance.js';
import { labels as labelsTable } from '../../db/schema/labels.js';
import { notes } from '../../db/schema/notes.js';
import { errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import { attachmentKeysForNotes, unlinkAttachmentFiles } from '../attachments/service.js';

export function isAdmin(config: Config, email: string): boolean {
  return config.adminEmails.includes(email.toLowerCase());
}

/**
 * The instance row, or the defaults when nobody has ever flipped a switch.
 * Read on every sign-up attempt, so it must not depend on a seeded row.
 */
export async function getInstanceSettings(db: Db): Promise<{ signupEnabled: boolean }> {
  const [row] = await db
    .select({ signupEnabled: instanceSettings.signupEnabled })
    .from(instanceSettings)
    .where(eq(instanceSettings.id, 'singleton'));
  return { signupEnabled: row?.signupEnabled ?? true };
}

export async function setInstanceSettings(
  db: Db,
  patch: { signupEnabled: boolean },
): Promise<{ signupEnabled: boolean }> {
  const [row] = await db
    .insert(instanceSettings)
    .values({ id: 'singleton', signupEnabled: patch.signupEnabled })
    .onConflictDoUpdate({
      target: instanceSettings.id,
      set: { signupEnabled: patch.signupEnabled, updatedAt: new Date() },
    })
    .returning({ signupEnabled: instanceSettings.signupEnabled });
  return { signupEnabled: row?.signupEnabled ?? patch.signupEnabled };
}

/** `sum()` is a bigint over an empty set: null, and a string otherwise. */
function toBytes(value: string | number | null): number {
  return value === null ? 0 : Number(value);
}

export async function getOverview(db: Db): Promise<AdminOverview> {
  const [{ signupEnabled }, [users], [notesTotal], [files]] = await Promise.all([
    getInstanceSettings(db),
    db.select({ n: count() }).from(userTable),
    db.select({ n: count() }).from(notes),
    db.select({ n: count(), bytes: sum(attachments.size) }).from(attachments),
  ]);
  return {
    signupEnabled,
    version: APP_VERSION,
    totals: {
      users: users?.n ?? 0,
      notes: notesTotal?.n ?? 0,
      attachments: files?.n ?? 0,
      storageBytes: toBytes(files?.bytes ?? null),
    },
  };
}

/**
 * A page of accounts with what each costs the instance: notes owned (trash
 * included — those files are still on disk) and the bytes of their attachments.
 *
 * The page is drawn first and the three totals are then asked only about the
 * ids on it. Two reasons: an instance can hold far more accounts than a dialog
 * should render (a long-lived dev database already holds thousands), and the
 * counts must be separate queries anyway — notes and labels are independent
 * one-to-many branches off the same user, so joining both at once multiplies
 * the rows and every count lies.
 */
export async function listUsers(
  db: Db,
  config: Config,
  opts: { q?: string | undefined; limit: number },
): Promise<AdminUserPage> {
  const needle = opts.q?.trim();
  const match = needle
    ? or(ilike(userTable.email, `%${needle}%`), ilike(userTable.name, `%${needle}%`))
    : undefined;

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: userTable.id,
        email: userTable.email,
        name: userTable.name,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(match)
      .orderBy(asc(userTable.createdAt))
      .limit(opts.limit),
    db.select({ n: count() }).from(userTable).where(match),
  ]);

  const ids = rows.map((r) => r.id);
  const [noteCounts, labelCounts, bytes] =
    ids.length === 0
      ? [[], [], []]
      : await Promise.all([
          db
            .select({ userId: notes.ownerId, n: count() })
            .from(notes)
            .where(inArray(notes.ownerId, ids))
            .groupBy(notes.ownerId),
          db
            .select({ userId: labelsTable.userId, n: count() })
            .from(labelsTable)
            .where(inArray(labelsTable.userId, ids))
            .groupBy(labelsTable.userId),
          db
            .select({ userId: notes.ownerId, bytes: sum(attachments.size) })
            .from(attachments)
            .innerJoin(notes, eq(notes.id, attachments.noteId))
            .where(inArray(notes.ownerId, ids))
            .groupBy(notes.ownerId),
        ]);

  const noteMap = new Map(noteCounts.map((r) => [r.userId, r.n]));
  const labelMap = new Map(labelCounts.map((r) => [r.userId, r.n]));
  const byteMap = new Map(bytes.map((r) => [r.userId, toBytes(r.bytes)]));

  return {
    total: totals?.n ?? 0,
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      admin: isAdmin(config, r.email),
      notes: noteMap.get(r.id) ?? 0,
      labels: labelMap.get(r.id) ?? 0,
      storageBytes: byteMap.get(r.id) ?? 0,
    })),
  };
}

/**
 * Delete an account and everything hanging off it. Every user-scoped table
 * cascades from `user`, so the row going away is the deletion; the part the
 * database cannot do is the attachment files, collected before the rows are
 * gone (a failure then leaves rows pointing at files, never the reverse).
 *
 * An account listed in ADMIN_EMAILS is refused: the env is the authority, so
 * deleting the row would leave a name that signs straight back in — and, when
 * it is your own, would lock you out of the panel that could undo it.
 */
export async function deleteUser(
  db: Db,
  config: Config,
  targetId: string,
  storage?: Storage,
): Promise<DeleteUserResult> {
  const [target] = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, targetId));
  if (!target) throw errors.notFound('No such user');
  if (isAdmin(config, target.email)) {
    throw errors.forbidden('Remove the address from ADMIN_EMAILS before deleting this account');
  }

  const ownedIds = (
    await db.select({ id: notes.id }).from(notes).where(eq(notes.ownerId, targetId))
  ).map((r) => r.id);
  const keys = await attachmentKeysForNotes(db, ownedIds);

  await db.delete(userTable).where(eq(userTable.id, targetId));
  if (storage && keys.length > 0) await unlinkAttachmentFiles(storage, keys);
  return { notes: ownedIds.length };
}
