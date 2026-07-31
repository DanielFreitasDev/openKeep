import { z } from 'zod';
import { zAttachment } from './attachments.js';
import { zNoteColor } from './common.js';
import { zNoteItem, zNoteType } from './notes.js';

/**
 * The owner's view of a note's public link. `url` null = no link; the address
 * itself is the credential, so revoking is deleting the row and creating again
 * mints a different one.
 */
export const zShareLink = z.object({
  url: z.string().nullable(),
  expiresAt: z.iso.datetime().nullable(),
});
export type ShareLink = z.infer<typeof zShareLink>;

/** Days the link stays alive; null (the default) = until it is revoked. */
export const zCreateShareLink = z.object({
  expiresInDays: z.number().int().min(1).max(365).nullable().default(null),
});

/**
 * What a link holder gets: the note's SHARED content and nothing else. Every
 * per-user field (labels, reminder, pin, archive, board position) belongs to a
 * membership row and stays private, and no member's name or email travels —
 * the page is the note, not the account behind it. `color` is the owner's,
 * because they are the one publishing the paper.
 */
export const zPublicNote = z.object({
  type: zNoteType,
  title: z.string(),
  bodyHtml: z.string(),
  items: z.array(zNoteItem),
  attachments: z.array(zAttachment),
  color: zNoteColor,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type PublicNote = z.infer<typeof zPublicNote>;
