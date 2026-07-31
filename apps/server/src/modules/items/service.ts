import type {
  CreateItemInput,
  ItemPatchResult,
  ItemsReplacedResult,
  NoteItem,
  PatchItemInput,
} from '@openkeep/shared';
import { LIMITS, positionAfter, positionBefore } from '@openkeep/shared';
import { and, asc, count, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { noteItems, notes } from '../../db/schema/notes.js';
import { userSettings } from '../../db/schema/settings.js';
import { AppError, errors } from '../../lib/errors.js';
import { assertNoteAccess, assertNotTrashed } from '../notes/access.js';
import { maybeSnapshot } from '../notes/service.js';

type ItemRow = typeof noteItems.$inferSelect;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function toDto(row: ItemRow): NoteItem {
  return {
    id: row.id,
    text: row.text,
    checked: row.checked,
    indent: (row.indent === 1 ? 1 : 0) as 0 | 1,
    position: row.position,
  };
}

async function orderedItems(db: Db | Tx, noteId: string): Promise<ItemRow[]> {
  return db
    .select()
    .from(noteItems)
    .where(eq(noteItems.noteId, noteId))
    .orderBy(asc(noteItems.position), asc(noteItems.id));
}

/** Item edits count as content edits: touch the note for Edited/session logic. */
async function touchNote(tx: Tx, noteId: string, userId: string): Promise<void> {
  await tx.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, noteId));
}

export async function createItem(
  db: Db,
  userId: string,
  noteId: string,
  input: CreateItemInput,
): Promise<NoteItem> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'editor');
    assertNotTrashed(note);
    if (note.type !== 'list') throw errors.badRequest('Not a list note');
    await maybeSnapshot(tx, note, userId);

    const [row] = await tx
      .select({ n: count() })
      .from(noteItems)
      .where(eq(noteItems.noteId, noteId));
    if ((row?.n ?? 0) >= LIMITS.itemsPerNoteMax) {
      throw new AppError(
        400,
        'item_limit_reached',
        'Item limit reached',
        `A list can have up to ${LIMITS.itemsPerNoteMax} items.`,
      );
    }

    let position = input.position;
    if (position === undefined) {
      const items = await orderedItems(tx, noteId);
      const [settings] = await tx
        .select({ bottom: userSettings.addItemsToBottom })
        .from(userSettings)
        .where(eq(userSettings.userId, userId));
      const toBottom = settings?.bottom ?? true;
      position = toBottom
        ? positionAfter(items.at(-1)?.position ?? null)
        : positionBefore(items[0]?.position ?? null);
    }

    const [created] = await tx
      .insert(noteItems)
      .values({
        noteId,
        text: input.text,
        checked: input.checked,
        indent: input.indent,
        position,
      })
      .returning();
    await touchNote(tx, noteId, userId);
    return toDto(created!);
  });
}

/**
 * Field-level LWW item patch. Toggling a parent (indent 0) `checked` cascades
 * to its following indent-1 run (Keep behavior).
 */
export async function patchItem(
  db: Db,
  userId: string,
  noteId: string,
  itemId: string,
  patch: PatchItemInput,
): Promise<ItemPatchResult> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'editor');
    assertNotTrashed(note);

    const [existing] = await tx
      .select()
      .from(noteItems)
      .where(and(eq(noteItems.id, itemId), eq(noteItems.noteId, noteId)))
      .limit(1);
    if (!existing) throw errors.notFound();
    await maybeSnapshot(tx, note, userId);

    const [updated] = await tx
      .update(noteItems)
      .set(patch)
      .where(eq(noteItems.id, itemId))
      .returning();
    const item = updated!;

    const cascaded: ItemRow[] = [];
    if (patch.checked !== undefined && item.indent === 0) {
      const items = await orderedItems(tx, noteId);
      const idx = items.findIndex((i) => i.id === itemId);
      for (let i = idx + 1; i >= 0 && i < items.length; i++) {
        const child = items[i]!;
        if (child.indent !== 1) break;
        if (child.checked !== patch.checked) {
          const [c] = await tx
            .update(noteItems)
            .set({ checked: patch.checked })
            .where(eq(noteItems.id, child.id))
            .returning();
          cascaded.push(c!);
        }
      }
    }

    await touchNote(tx, noteId, userId);
    return { item: toDto(item), cascaded: cascaded.map(toDto) };
  });
}

export async function deleteItem(
  db: Db,
  userId: string,
  noteId: string,
  itemId: string,
): Promise<void> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'editor');
    assertNotTrashed(note);
    await maybeSnapshot(tx, note, userId);
    const deleted = await tx
      .delete(noteItems)
      .where(and(eq(noteItems.id, itemId), eq(noteItems.noteId, noteId)))
      .returning({ id: noteItems.id });
    if (deleted.length === 0) throw errors.notFound();
    await touchNote(tx, noteId, userId);
  });
}

export async function uncheckAll(
  db: Db,
  userId: string,
  noteId: string,
): Promise<ItemsReplacedResult> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'editor');
    assertNotTrashed(note);
    await maybeSnapshot(tx, note, userId, { force: true });
    await tx.update(noteItems).set({ checked: false }).where(eq(noteItems.noteId, noteId));
    await touchNote(tx, noteId, userId);
    return { noteId, items: (await orderedItems(tx, noteId)).map(toDto) };
  });
}

export async function deleteChecked(
  db: Db,
  userId: string,
  noteId: string,
): Promise<ItemsReplacedResult> {
  return db.transaction(async (tx) => {
    const { note } = await assertNoteAccess(tx as unknown as Db, userId, noteId, 'editor');
    assertNotTrashed(note);
    await maybeSnapshot(tx, note, userId, { force: true });
    await tx
      .delete(noteItems)
      .where(and(eq(noteItems.noteId, noteId), eq(noteItems.checked, true)));
    await touchNote(tx, noteId, userId);
    return { noteId, items: (await orderedItems(tx, noteId)).map(toDto) };
  });
}
