import type { ProtectionStatus, SetNotePin, UnlockNotes } from '@openkeep/shared';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { account } from '../../db/schema/auth.js';
import { userSettings } from '../../db/schema/settings.js';
import { errors } from '../../lib/errors.js';
import {
  grantReveal,
  isThrottled,
  recordFailure,
  revealedUntil,
  revokeReveal,
} from '../../lib/note-protection.js';

/**
 * Where a protected note's credentials are checked. Two of them, hashed by
 * the same scrypt Better Auth uses for the password itself:
 *
 * - the ACCOUNT PASSWORD, read straight from Better Auth's `credential`
 *   account row (no sign-in call — re-authenticating must not mint a session);
 * - an optional PIN, which exists because nobody types twenty characters to
 *   glance at a note on a phone. It is a shortcut for the password, so the
 *   password is what authorizes setting or clearing it.
 */

/** The credential row, or null for an account that only ever used OAuth. */
async function passwordHash(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1);
  return row?.password ?? null;
}

async function pinHash(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ hash: userSettings.notePinHash })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.hash ?? null;
}

export async function getStatus(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<ProtectionStatus> {
  const until = revealedUntil(sessionId);
  return {
    pinSet: (await pinHash(db, userId)) !== null,
    hasPassword: (await passwordHash(db, userId)) !== null,
    unlockedUntil: until ? until.toISOString() : null,
  };
}

/** Verifies the account password; throws when the account has none. */
async function checkPassword(db: Db, userId: string, password: string): Promise<boolean> {
  const hash = await passwordHash(db, userId);
  if (hash === null) {
    throw errors.badRequest(
      'This account signs in with a provider and has no password — use the PIN instead.',
    );
  }
  return verifyPassword({ hash, password });
}

/**
 * Re-authenticate, opening this session's reveal window. Either credential
 * works and neither is named in the failure: an attempt that says "wrong PIN"
 * has already told the attacker a PIN exists.
 */
export async function unlockNotes(
  db: Db,
  userId: string,
  sessionId: string,
  input: UnlockNotes,
): Promise<Date> {
  const throttled = isThrottled(sessionId);
  if (throttled !== null) {
    throw errors.conflict(
      'rate_limited',
      'Too many attempts',
      `Wait ${throttled} seconds before trying again.`,
    );
  }

  let ok = false;
  if (input.pin !== undefined) {
    const hash = await pinHash(db, userId);
    ok = hash !== null && (await verifyPassword({ hash, password: input.pin }));
  } else if (input.password !== undefined) {
    ok = await checkPassword(db, userId, input.password);
  }

  if (!ok) {
    recordFailure(sessionId);
    throw errors.invalidCredential('That password or PIN is not correct.');
  }
  return grantReveal(sessionId);
}

/** "Lock now": the curtain falls again for this session without waiting out the TTL. */
export function lockNotes(sessionId: string): void {
  revokeReveal(sessionId);
}

/**
 * Set, change or (with `pin: null`) remove the PIN. The password is required
 * whenever the account has one — otherwise a borrowed session could quietly
 * install a PIN it knows and walk through the curtain from then on.
 */
export async function setNotePin(db: Db, userId: string, input: SetNotePin): Promise<void> {
  const hash = await passwordHash(db, userId);
  if (hash !== null) {
    if (input.password === undefined) {
      throw errors.badRequest('Confirm your account password to change the PIN.');
    }
    if (!(await verifyPassword({ hash, password: input.password }))) {
      throw errors.invalidCredential('That password is not correct.');
    }
  }
  await db
    .update(userSettings)
    .set({ notePinHash: input.pin === null ? null : await hashPassword(input.pin) })
    .where(eq(userSettings.userId, userId));
}
