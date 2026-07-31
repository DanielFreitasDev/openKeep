import { z } from 'zod';
import { NOTE_BACKGROUNDS } from '../constants/backgrounds.js';
import { NOTE_COLORS } from '../constants/colors.js';

export const zId = z.uuid();

export const zNoteColor = z.enum(NOTE_COLORS);
export const zNoteBackground = z.enum(NOTE_BACKGROUNDS);

/**
 * Membership level. `collaborator` IS the editor level — the name predates
 * read-only sharing and stays, so no stored row and no client DTO has to be
 * rewritten to gain a third level. Ordered least → most authority.
 */
export const zNoteRole = z.enum(['viewer', 'collaborator', 'owner']);
export type NoteRole = z.infer<typeof zNoteRole>;

/** The two levels the owner can hand out. */
export const zInviteRole = z.enum(['collaborator', 'viewer']);
export type InviteRole = z.infer<typeof zInviteRole>;

/** RFC 9457 problem details, extended with our stable machine-readable `code`. */
export const zProblemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string().optional(),
  /** Field-level validation issues, when applicable. */
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ProblemDetails = z.infer<typeof zProblemDetails>;

/** Stable error code catalog (§ API error model). */
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'note_trashed',
  'label_limit_reached',
  'label_exists',
  'item_limit_reached',
  'attachment_limit_reached',
  'collaborator_limit_reached',
  'token_limit_reached',
  'sharing_disabled',
  'sharing_disabled_for_target',
  'collaborator_not_registered',
  'already_collaborator',
  'note_read_only',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  'internal_error',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
