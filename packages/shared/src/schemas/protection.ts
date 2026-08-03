import { z } from 'zod';
import { zId } from './common.js';

/**
 * A PIN is a shortcut for the account password, not a second class of secret:
 * short enough to type on a phone, long enough that the server's attempt
 * counter — not its entropy — is what makes it safe.
 */
export const NOTE_PIN_MIN = 4;
export const NOTE_PIN_MAX = 8;
export const zNotePin = z.string().regex(/^\d{4,8}$/, 'Expected 4 to 8 digits');

/**
 * Re-authentication for protected notes. Either credential works; the PIN is
 * only accepted when one has been set.
 */
export const zUnlockNotes = z
  .object({
    password: z.string().min(1).max(200).optional(),
    pin: zNotePin.optional(),
  })
  .refine((v) => v.password !== undefined || v.pin !== undefined, {
    message: 'Provide the account password or the PIN',
  });
export type UnlockNotes = z.infer<typeof zUnlockNotes>;

/**
 * What the UI needs to draw the lock: whether a PIN exists (offer it),
 * whether the account has a password at all (an OAuth-only account has
 * nothing to retype), and when the current reveal runs out.
 */
export const zProtectionStatus = z.object({
  pinSet: z.boolean(),
  hasPassword: z.boolean(),
  /** ISO instant the reveal expires, or null when nothing is revealed. */
  unlockedUntil: z.iso.datetime().nullable(),
});
export type ProtectionStatus = z.infer<typeof zProtectionStatus>;

/** `pin: null` removes it. The password is what authorizes either way. */
export const zSetNotePin = z.object({
  password: z.string().min(1).max(200).optional(),
  pin: zNotePin.nullable(),
});
export type SetNotePin = z.infer<typeof zSetNotePin>;

export const zNoteLockResult = z.object({ id: zId, locked: z.boolean() });
export type NoteLockResult = z.infer<typeof zNoteLockResult>;
