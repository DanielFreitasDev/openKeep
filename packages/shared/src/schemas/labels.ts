import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { LABEL_PATH_SEPARATOR } from '../lib/labels.js';
import { zId, zNoteColor } from './common.js';

export const zLabel = z.object({
  id: zId,
  name: z.string(),
  /** Parent in the tree; `null` is a root label. Deleting a parent takes its subtree. */
  parentId: zId.nullable(),
  /** A note colour, reused so a label reads as part of the same palette. */
  color: zNoteColor,
  emoji: z.string().nullable(),
  /** Manual order *among siblings*; the client sorts by it, name as tiebreak. */
  position: z.string(),
  createdAt: z.iso.datetime(),
});
export type Label = z.infer<typeof zLabel>;

/**
 * A single segment, never a path. `/` is reserved so that `Work/Ideas` always
 * means "Ideas inside Work" and never a label literally called that — names
 * are only unique among siblings, so the path is the identifier and it has to
 * parse unambiguously. Names created before this rule keep working; they just
 * cannot be re-created.
 */
export const zLabelName = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.labelNameMax)
  .refine((n) => !n.includes(LABEL_PATH_SEPARATOR), {
    message: `Label names cannot contain "${LABEL_PATH_SEPARATOR}" — nest with parentId instead`,
  });

/** A path like `Work/Clients/ACME`; segments are trimmed on resolution. */
export const zLabelPath = z.string().trim().min(1).max(LIMITS.labelPathMax);
/**
 * One grapheme, but graphemes are wide: a flag is 8 code units, and a
 * profession emoji with a skin tone is longer still. Length is capped rather
 * than shape-checked — the picker offers a list, and a determined paste of two
 * emoji is nobody's security problem.
 */
export const zLabelEmoji = z.string().trim().min(1).max(16).nullable();

export const zCreateLabel = z.object({
  name: zLabelName,
  /** Omitted or null creates a root label. */
  parentId: zId.nullable().optional(),
});
/** Every field optional: rename, recolour, re-emoji, reparent and reorder share it. */
export const zPatchLabel = z
  .object({
    name: zLabelName,
    /** `null` promotes the label (and its subtree) back to the root. */
    parentId: zId.nullable(),
    color: zNoteColor,
    emoji: zLabelEmoji,
    position: z.string().min(1).max(64),
  })
  .partial();
export type PatchLabel = z.infer<typeof zPatchLabel>;
