import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { zId, zNoteColor } from './common.js';

export const zLabel = z.object({
  id: zId,
  name: z.string(),
  /** A note colour, reused so a label reads as part of the same palette. */
  color: zNoteColor,
  emoji: z.string().nullable(),
  /** Manual sidebar order; the client sorts by it, name as tiebreak. */
  position: z.string(),
  createdAt: z.iso.datetime(),
});
export type Label = z.infer<typeof zLabel>;

export const zLabelName = z.string().trim().min(1).max(LIMITS.labelNameMax);
/**
 * One grapheme, but graphemes are wide: a flag is 8 code units, and a
 * profession emoji with a skin tone is longer still. Length is capped rather
 * than shape-checked — the picker offers a list, and a determined paste of two
 * emoji is nobody's security problem.
 */
export const zLabelEmoji = z.string().trim().min(1).max(16).nullable();

export const zCreateLabel = z.object({ name: zLabelName });
/** Every field optional: rename, recolour, re-emoji and reorder share it. */
export const zPatchLabel = z
  .object({
    name: zLabelName,
    color: zNoteColor,
    emoji: zLabelEmoji,
    position: z.string().min(1).max(64),
  })
  .partial();
export type PatchLabel = z.infer<typeof zPatchLabel>;
