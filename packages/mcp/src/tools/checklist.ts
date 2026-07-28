import type { NoteItem } from '@openkeep/shared';
import { zId } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
const zItemId = zId.describe('Checklist item id (uuid)');

const stripPosition = (i: NoteItem) => ({
  id: i.id,
  text: i.text,
  checked: i.checked,
  indent: i.indent,
});

export const addChecklistItems = defineTool({
  name: 'add_checklist_items',
  description:
    'Append checklist items to a list note (converts nothing — use convert_note first if it is a text note). Items are created sequentially in the given order.',
  inputSchema: z.object({
    note_id: zNoteId,
    items: z
      .array(
        z.object({
          text: z.string().max(1000),
          checked: z.boolean().optional(),
          indent: z.union([z.literal(0), z.literal(1)]).optional(),
        }),
      )
      .min(1)
      .max(100),
  }),
  handler: async (client, args) => {
    // The REST layer creates one item per POST; a sequential loop preserves
    // order (placement honors the user's add-to-bottom setting).
    const added: NoteItem[] = [];
    for (const item of args.items) {
      added.push(await client.createItem(args.note_id, item));
    }
    return { added: added.length, items: added.map(stripPosition) };
  },
});

export const updateChecklistItem = defineTool({
  name: 'update_checklist_item',
  description:
    'Edit a checklist item: text, checked state or indent. Checking a parent item cascades to its indented children (returned in `cascaded`).',
  inputSchema: z.object({
    note_id: zNoteId,
    item_id: zItemId,
    text: z.string().max(1000).optional(),
    checked: z.boolean().optional(),
    indent: z.union([z.literal(0), z.literal(1)]).optional(),
  }),
  handler: async (client, args) => {
    const { note_id, item_id, ...patch } = args;
    if (Object.keys(patch).length === 0) {
      throw new Error('Nothing to change — pass text, checked or indent.');
    }
    const result = await client.patchItem(note_id, item_id, patch);
    return {
      item: stripPosition(result.item),
      ...(result.cascaded.length > 0 ? { cascaded: result.cascaded.map(stripPosition) } : {}),
    };
  },
});

export const deleteChecklistItem = defineTool({
  name: 'delete_checklist_item',
  description: 'Remove one checklist item from a note.',
  inputSchema: z.object({ note_id: zNoteId, item_id: zItemId }),
  handler: async (client, args) => {
    await client.deleteItem(args.note_id, args.item_id);
    return { deleted: true };
  },
});

export const uncheckAllItems = defineTool({
  name: 'uncheck_all_items',
  description: 'Uncheck every checklist item in a note (e.g. to reuse a shopping list).',
  inputSchema: z.object({ note_id: zNoteId }),
  handler: async (client, args) => {
    const result = await client.uncheckAll(args.note_id);
    return { items: result.items.map(stripPosition) };
  },
});

export const deleteCheckedItems = defineTool({
  name: 'delete_checked_items',
  description: 'Delete every CHECKED checklist item in a note (irreversible).',
  inputSchema: z.object({ note_id: zNoteId }),
  annotations: { destructiveHint: true },
  handler: async (client, args) => {
    const result = await client.deleteChecked(args.note_id);
    return { items: result.items.map(stripPosition) };
  },
});
