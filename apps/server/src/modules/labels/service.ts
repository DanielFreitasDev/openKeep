import type { Label, PatchLabel } from '@openkeep/shared';
import { LIMITS, positionAfter } from '@openkeep/shared';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { labels, noteLabels } from '../../db/schema/labels.js';
import { AppError, errors } from '../../lib/errors.js';
import { assertNoteAccess } from '../notes/access.js';

type LabelRow = typeof labels.$inferSelect;

function toDto(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    color: row.color as Label['color'],
    emoji: row.emoji,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur instanceof Error; depth++) {
    if ((cur as { code?: string }).code === '23505') return true;
    cur = cur.cause;
  }
  return false;
}

/**
 * Manual order, name as tiebreak. Before this column existed the order WAS the
 * name, and the migration froze that arrangement into positions — so an
 * account that never drags a label sees exactly what it saw before.
 */
export async function listLabels(db: Db, userId: string): Promise<Label[]> {
  const rows = await db
    .select()
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.position), asc(sql`lower(${labels.name})`));
  return rows.map(toDto);
}

export async function createLabel(db: Db, userId: string, name: string): Promise<Label> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ n: count() }).from(labels).where(eq(labels.userId, userId));
    if ((row?.n ?? 0) >= LIMITS.labelsPerUserMax) {
      throw errors.labelLimitReached();
    }
    // New labels land at the bottom of the manual order rather than jumping
    // into the middle alphabetically.
    const [last] = await tx
      .select({ position: labels.position })
      .from(labels)
      .where(eq(labels.userId, userId))
      .orderBy(desc(labels.position))
      .limit(1);
    try {
      const [created] = await tx
        .insert(labels)
        .values({ userId, name, position: positionAfter(last?.position ?? null) })
        .returning();
      return toDto(created!);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError(409, 'label_exists', 'Label already exists');
      }
      throw err;
    }
  });
}

export async function patchLabel(
  db: Db,
  userId: string,
  labelId: string,
  patch: PatchLabel,
): Promise<Label> {
  if (Object.keys(patch).length === 0) throw errors.badRequest('Nothing to update');
  try {
    const [updated] = await db
      .update(labels)
      .set(patch)
      .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
      .returning();
    if (!updated) throw errors.notFound();
    return toDto(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, 'label_exists', 'Label already exists');
    }
    throw err;
  }
}

export async function deleteLabel(db: Db, userId: string, labelId: string): Promise<void> {
  const deleted = await db
    .delete(labels)
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
    .returning({ id: labels.id });
  if (deleted.length === 0) throw errors.notFound();
}

/** Idempotent add: PUT /notes/:id/labels/:labelId. The label must be MINE. */
export async function addLabelToNote(
  db: Db,
  userId: string,
  noteId: string,
  labelId: string,
): Promise<void> {
  await assertNoteAccess(db, userId, noteId);
  const [label] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
    .limit(1);
  if (!label) throw errors.notFound();
  await db.insert(noteLabels).values({ noteId, userId, labelId }).onConflictDoNothing();
}

export async function removeLabelFromNote(
  db: Db,
  userId: string,
  noteId: string,
  labelId: string,
): Promise<void> {
  await assertNoteAccess(db, userId, noteId);
  await db
    .delete(noteLabels)
    .where(
      and(
        eq(noteLabels.noteId, noteId),
        eq(noteLabels.userId, userId),
        eq(noteLabels.labelId, labelId),
      ),
    );
}
