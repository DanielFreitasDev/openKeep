import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { zId, zNoteBackground, zNoteColor } from './common.js';

export const zNoteType = z.enum(['text', 'list']);
export const zNoteRole = z.enum(['owner', 'collaborator']);
export const zIndent = z.union([z.literal(0), z.literal(1)]);

export const zNoteItem = z.object({
  id: zId,
  text: z.string().max(LIMITS.itemTextMax),
  checked: z.boolean(),
  indent: zIndent,
  position: z.string(),
});
export type NoteItem = z.infer<typeof zNoteItem>;

/** A note as the requesting user sees it: shared content + their per-user state. */
export const zFullNote = z.object({
  id: zId,
  type: zNoteType,
  title: z.string(),
  bodyHtml: z.string(),
  hasLinks: z.boolean(),
  items: z.array(zNoteItem),
  /** Per-user label assignment. */
  labelIds: z.array(zId),
  role: zNoteRole,
  pinned: z.boolean(),
  archived: z.boolean(),
  color: zNoteColor,
  background: zNoteBackground,
  position: z.string(),
  trashedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type FullNote = z.infer<typeof zFullNote>;

export const zCreateNoteItem = z.object({
  text: z.string().max(LIMITS.itemTextMax),
  checked: z.boolean().default(false),
  indent: zIndent.default(0),
});

export const zCreateNote = z.object({
  /** Client-generated UUIDv7 → stable ?note= URL before the server confirms. */
  id: zId.optional(),
  type: zNoteType.default('text'),
  title: z.string().max(LIMITS.noteTitleMax).default(''),
  bodyHtml: z.string().max(LIMITS.noteBodyHtmlMax).default(''),
  items: z.array(zCreateNoteItem).max(LIMITS.itemsPerNoteMax).default([]),
  pinned: z.boolean().default(false),
  color: zNoteColor.default('default'),
  background: zNoteBackground.default('none'),
});
export type CreateNote = z.infer<typeof zCreateNote>;

export const zPatchNoteContent = z
  .object({
    title: z.string().max(LIMITS.noteTitleMax),
    bodyHtml: z.string().max(LIMITS.noteBodyHtmlMax),
  })
  .partial();
export type PatchNoteContent = z.infer<typeof zPatchNoteContent>;

/** Canonical (sanitized) content echoed back so caches converge. */
export const zNoteContentResult = z.object({
  id: zId,
  title: z.string(),
  bodyHtml: z.string(),
  hasLinks: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type NoteContentResult = z.infer<typeof zNoteContentResult>;

export const zPatchNoteState = z
  .object({
    pinned: z.boolean(),
    archived: z.boolean(),
    color: zNoteColor,
    background: zNoteBackground,
    position: z.string().max(256),
  })
  .partial();
export type PatchNoteState = z.infer<typeof zPatchNoteState>;

export const zNoteStateResult = z.object({
  id: zId,
  pinned: z.boolean(),
  archived: z.boolean(),
  color: zNoteColor,
  background: zNoteBackground,
  position: z.string(),
});
export type NoteStateResult = z.infer<typeof zNoteStateResult>;

export const zConvertNote = z.object({ to: zNoteType });

export const zNoteVersionMeta = z.object({
  id: zId,
  createdAt: z.iso.datetime(),
  createdBy: z.string().nullable(),
});
export type NoteVersionMeta = z.infer<typeof zNoteVersionMeta>;

export const zListNotesQuery = z.object({
  view: z.enum(['active', 'archived', 'trash']).optional(),
});
