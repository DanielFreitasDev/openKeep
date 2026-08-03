import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Protected notes, in two halves that never talk to each other:
 *
 * - a REVEAL, granted to one session for a few minutes when it retypes the
 *   account password (or the PIN), held here in memory;
 * - a REQUEST CONTEXT saying whether *this* request inherited that reveal,
 *   which is the bit `assertNoteAccess` and `toFullNote` actually read.
 *
 * The context is ambient rather than a parameter on thirty service functions
 * because "may this request see hidden notes" is request scope, like a request
 * id — and because the default of an absent context is `false`. Anything with
 * no request behind it (a pg-boss job, a WebSocket frame, a unit test) sees a
 * locked note redacted, which is the answer that fails safe.
 *
 * The reveal is deliberately per SESSION, not per account: unlocking on the
 * phone must not uncover the laptop left open at the office. It lives in
 * process memory, so a restart re-locks everything — that is a feature, and
 * the realtime registry already assumes one process per instance.
 */

/** How long one re-authentication keeps protected notes visible. */
export const REVEAL_TTL_MS = 15 * 60 * 1000;

/** Wrong PINs allowed in a row before the credential stops being accepted. */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 5 * 60 * 1000;

export interface ProtectionContext {
  /** Mutable: `requireAuth` fills it in once the session is known. */
  revealed: boolean;
}

const storage = new AsyncLocalStorage<ProtectionContext>();

/** Opens a fresh (not yet revealed) context for the request about to run. */
export function enterProtectionContext(): ProtectionContext {
  const ctx: ProtectionContext = { revealed: false };
  storage.enterWith(ctx);
  return ctx;
}

/** True only inside a request whose session re-authenticated recently. */
export function requestIsRevealed(): boolean {
  return storage.getStore()?.revealed ?? false;
}

/** Runs `fn` as if its request had (or had not) re-authenticated — tests. */
export function withRevealed<T>(revealed: boolean, fn: () => T): T {
  return storage.run({ revealed }, fn);
}

const reveals = new Map<string, number>();
const failures = new Map<string, { count: number; until: number }>();

function sweep(now: number): void {
  for (const [key, expiry] of reveals) if (expiry <= now) reveals.delete(key);
  for (const [key, f] of failures) if (f.until <= now) failures.delete(key);
}

/** Starts (or restarts) a session's reveal window. Returns when it ends. */
export function grantReveal(sessionId: string, now = Date.now()): Date {
  sweep(now);
  const until = now + REVEAL_TTL_MS;
  reveals.set(sessionId, until);
  failures.delete(sessionId);
  return new Date(until);
}

/** "Lock now" — the window closes immediately for this session. */
export function revokeReveal(sessionId: string): void {
  reveals.delete(sessionId);
}

export function revealedUntil(sessionId: string, now = Date.now()): Date | null {
  const until = reveals.get(sessionId);
  if (until === undefined) return null;
  if (until <= now) {
    reveals.delete(sessionId);
    return null;
  }
  return new Date(until);
}

export function isRevealed(sessionId: string, now = Date.now()): boolean {
  return revealedUntil(sessionId, now) !== null;
}

/**
 * Throttle for the credential itself. A 4-digit PIN has 10 000 answers, so
 * what makes it safe is that the fifth wrong one costs five minutes — and the
 * counter is per session rather than per IP, because the attacker we care
 * about is already holding the unlocked laptop.
 */
export function isThrottled(sessionId: string, now = Date.now()): number | null {
  const f = failures.get(sessionId);
  if (!f || f.until <= now || f.count < MAX_FAILURES) return null;
  return Math.ceil((f.until - now) / 1000);
}

export function recordFailure(sessionId: string, now = Date.now()): void {
  sweep(now);
  const f = failures.get(sessionId);
  const count = f && f.until > now ? f.count + 1 : 1;
  failures.set(sessionId, { count, until: now + FAILURE_WINDOW_MS });
}

/** Test seam — the maps outlive a single app instance otherwise. */
export function resetProtectionState(): void {
  reveals.clear();
  failures.clear();
}
