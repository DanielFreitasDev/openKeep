import type { NoteLockResult, ProtectionStatus, SetNotePin, UnlockNotes } from '@openkeep/shared';
import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { api } from './api.js';
import { notesQuery } from './notes-api.js';

/**
 * Protected notes, client side. Almost nothing lives here: the curtain is the
 * server's, and this file only asks when it is up. A locked note arrives with
 * its words already stripped, so there is no "hidden" content in the cache to
 * leak — which is also why revealing is a REFETCH rather than a state flip.
 */

/**
 * Every card on the board asks this (it decides whether to draw the lock), so
 * it carries a stale time like any other read — a `staleTime: 0` here would
 * refetch on every card that scrolls into view. Staying honest is not left to
 * polling: the window's own expiry re-reads it on the dot, unlocking and
 * locking invalidate it, and a sibling tab says so over the BroadcastChannel.
 */
export const protectionQuery = queryOptions({
  queryKey: ['protection'],
  queryFn: () => api<ProtectionStatus>('/api/protection'),
  staleTime: 30_000,
});

export const unlockNotes = (body: UnlockNotes) =>
  api<{ unlockedUntil: string }>('/api/protection/unlock', { method: 'POST', body });

export const lockNotesNow = () => api<undefined>('/api/protection/lock', { method: 'POST' });

export const setNotePin = (body: SetNotePin) =>
  api<undefined>('/api/protection/pin', { method: 'PUT', body });

export const lockNote = (id: string) =>
  api<NoteLockResult>(`/api/notes/${id}/lock`, { method: 'POST' });

export const unlockNote = (id: string) =>
  api<NoteLockResult>(`/api/notes/${id}/unlock`, { method: 'POST' });

/** True while this session may see protected notes. */
export function isRevealed(status: ProtectionStatus | undefined): boolean {
  return status?.unlockedUntil != null && Date.parse(status.unlockedUntil) > Date.now();
}

/**
 * Sibling tabs share the session, and therefore the reveal — but the server
 * fans events out per ACCOUNT, which would also wake the phone. A
 * BroadcastChannel is scoped to exactly the right thing: this browser.
 */
const CHANNEL = 'openkeep-protection';

export function announceRevealChange(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage('changed');
  ch.close();
}

export function onRevealChange(handler: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = handler;
  return () => ch.close();
}

/**
 * Both caches move together, always: the corpus holds redacted notes when the
 * curtain is up and real ones when it is not, so a reveal that refreshed only
 * the status would leave the board lying about itself.
 *
 * Awaitable, and callers that are about to OPEN a note must await it. The
 * corpus is where the editor reads its starting text, and a note opened in the
 * gap between "revealed" and "refetched" mounts the editor over the redacted
 * copy — an empty note the autosave would then be happy to keep.
 */
export function refreshProtectedViews(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: protectionQuery.queryKey }),
    queryClient.invalidateQueries({ queryKey: notesQuery.queryKey }),
  ]).then(() => undefined);
}
