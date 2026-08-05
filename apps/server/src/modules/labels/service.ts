import type { Label, PatchLabel } from '@openkeep/shared';
import {
  findLabelByPath,
  flattenLabelTree,
  isLabelDescendant,
  LIMITS,
  labelSubtreeIds,
  positionAfter,
} from '@openkeep/shared';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { labels, noteLabels } from '../../db/schema/labels.js';
import { AppError, errors } from '../../lib/errors.js';
import { assertNoteAccess } from '../notes/access.js';

type LabelRow = typeof labels.$inferSelect;
/** The transaction handle a service gets inside `db.transaction`. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function toDto(row: LabelRow): Label {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId,
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

/** Every label of the account, unordered — the tree helpers sort what they need. */
async function allLabels(db: Db | Tx, userId: string): Promise<Label[]> {
  const rows = await db.select().from(labels).where(eq(labels.userId, userId));
  return rows.map(toDto);
}

/**
 * Depth-first, so the flat array a client receives already reads as the tree:
 * a parent is immediately followed by its subtree. Within a sibling group the
 * manual position leads and the name is the tiebreak — before that column
 * existed the order WAS the name, and the migration froze that arrangement, so
 * an account that never drags a label sees exactly what it saw before.
 */
export async function listLabels(db: Db, userId: string): Promise<Label[]> {
  return flattenLabelTree(await allLabels(db, userId)).map((f) => f.label);
}

/** The position a new child of `parentId` gets: after the last existing sibling. */
async function nextSiblingPosition(
  tx: Tx,
  userId: string,
  parentId: string | null,
): Promise<string> {
  const [last] = await tx
    .select({ position: labels.position })
    .from(labels)
    .where(
      and(
        eq(labels.userId, userId),
        parentId === null ? isNull(labels.parentId) : eq(labels.parentId, parentId),
      ),
    )
    .orderBy(desc(labels.position))
    .limit(1);
  return positionAfter(last?.position ?? null);
}

/** A parent must exist and be mine; anything else is a 404, never an oracle. */
async function assertParentOwned(tx: Tx, userId: string, parentId: string): Promise<void> {
  const [parent] = await tx
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.id, parentId), eq(labels.userId, userId)))
    .limit(1);
  if (!parent) throw errors.notFound('No such parent label');
}

export async function createLabel(
  db: Db,
  userId: string,
  name: string,
  parentId: string | null = null,
): Promise<Label> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ n: count() }).from(labels).where(eq(labels.userId, userId));
    if ((row?.n ?? 0) >= LIMITS.labelsPerUserMax) {
      throw errors.labelLimitReached();
    }
    if (parentId) await assertParentOwned(tx, userId, parentId);
    // New labels land at the bottom of their sibling group rather than jumping
    // into the middle alphabetically.
    const position = await nextSiblingPosition(tx, userId, parentId);
    try {
      const [created] = await tx
        .insert(labels)
        .values({ userId, name, parentId, position })
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
  return db.transaction(async (tx) => {
    const values: Partial<typeof labels.$inferInsert> = { ...patch };

    if ('parentId' in patch) {
      const parentId = patch.parentId ?? null;
      if (parentId !== null) {
        await assertParentOwned(tx, userId, parentId);
        // The DB check catches self-parenting; only an ancestry walk catches
        // "under my own descendant", which would strand the subtree.
        if (isLabelDescendant(await allLabels(tx, userId), parentId, labelId)) {
          throw errors.labelCycle();
        }
      }
      // A move lands at the end of its new sibling group unless the caller
      // said where — otherwise it would inherit a position meant for the old
      // group and surface in an arbitrary slot.
      if (patch.position === undefined) {
        values.position = await nextSiblingPosition(tx, userId, parentId);
      }
    }

    try {
      const [updated] = await tx
        .update(labels)
        .set(values)
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
  });
}

/**
 * Deleting a folder deletes what is in it: the self-FK cascades to the whole
 * subtree, and `note_labels` cascades off that in turn. The ids come back so
 * the realtime event can name every label that just stopped existing — a
 * client cannot infer the subtree from a parent it has already dropped.
 */
export async function deleteLabel(db: Db, userId: string, labelId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const mine = await allLabels(tx, userId);
    if (!mine.some((l) => l.id === labelId)) throw errors.notFound();
    const ids = labelSubtreeIds(mine, labelId);
    await tx.delete(labels).where(and(eq(labels.id, labelId), eq(labels.userId, userId)));
    return ids;
  });
}

/**
 * Resolve `Work/Clients` to the ids a filter should match: the label plus
 * every descendant, because opening a folder shows what is filed under it.
 * An unknown path yields `[]`, which matches no note — the honest answer.
 */
export async function resolveLabelPathToIds(
  db: Db,
  userId: string,
  path: string,
): Promise<string[]> {
  const mine = await allLabels(db, userId);
  const found = findLabelByPath(mine, path);
  return found ? labelSubtreeIds(mine, found.id) : [];
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
