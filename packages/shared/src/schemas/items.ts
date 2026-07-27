import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { zIndent, zNoteItem } from './notes.js';

export const zCreateItemInput = z.object({
  text: z.string().max(LIMITS.itemTextMax).default(''),
  checked: z.boolean().default(false),
  indent: zIndent.default(0),
  /** Explicit fractional position; when absent the server honors the
   *  "Add new items to the bottom" setting. */
  position: z.string().max(256).optional(),
});
export type CreateItemInput = z.infer<typeof zCreateItemInput>;

export const zPatchItemInput = z
  .object({
    text: z.string().max(LIMITS.itemTextMax),
    checked: z.boolean(),
    indent: zIndent,
    position: z.string().max(256),
  })
  .partial();
export type PatchItemInput = z.infer<typeof zPatchItemInput>;

/** Patch result: the changed item + any cascade side effects (parent check). */
export const zItemPatchResult = z.object({
  item: zNoteItem,
  /** Items auto-(un)checked because their parent toggled. */
  cascaded: z.array(zNoteItem),
});
export type ItemPatchResult = z.infer<typeof zItemPatchResult>;

export const zItemsReplacedResult = z.object({
  noteId: z.uuid(),
  items: z.array(zNoteItem),
});
export type ItemsReplacedResult = z.infer<typeof zItemsReplacedResult>;
