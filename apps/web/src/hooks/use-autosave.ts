import { useCallback, useEffect, useRef } from 'react';
import { saveNoteDraftFields } from '../lib/drafts.js';

/**
 * Debounced per-field autosave (500 ms trailing). Only dirty fields are sent;
 * flush fires on blur/close/visibilitychange/unmount. The dirty map doubles as
 * the anti-stomp guard: remote patches must not overwrite dirty fields.
 *
 * With a `draftId`, every dirty value is also mirrored to the local draft
 * store, so an edit survives a reload even if the PATCH never lands; the
 * mirror is cleared by the mutation's ack, not by flush.
 *
 * `committed` reads back what the server already holds for a field, so a
 * "change" to the value that is already stored is dropped rather than queued.
 */
export function useAutosave(
  save: (patch: Record<string, unknown>) => void,
  delayMs = 500,
  draftId?: string,
  committed?: (field: string) => unknown,
) {
  const dirtyRef = useRef(new Map<string, unknown>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const committedRef = useRef(committed);
  committedRef.current = committed;

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    if (dirtyRef.current.size === 0) return;
    const patch = Object.fromEntries(dirtyRef.current);
    dirtyRef.current.clear();
    saveRef.current(patch);
  }, []);

  const markDirty = useCallback(
    (field: string, value: unknown) => {
      // A value the server already has is not an edit. Editors re-emit their
      // content for reasons that have nothing to do with typing — a remote
      // merge writing the same html back, a programmatic setContent, a
      // conversion — and each of those used to queue a PATCH of unchanged
      // content. Online that is only noise; offline those no-op writes sit in
      // the outbox holding the *pre-edit* value and race the real edit on
      // reconnect, where whichever lands last wins. A field that is already
      // dirty keeps the normal path: the pending value is the one to replace.
      if (!dirtyRef.current.has(field) && committedRef.current?.(field) === value) return;
      dirtyRef.current.set(field, value);
      if (draftIdRef.current) saveNoteDraftFields(draftIdRef.current, { [field]: value });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  const isDirty = useCallback(
    (field?: string) => (field ? dirtyRef.current.has(field) : dirtyRef.current.size > 0),
    [],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return { markDirty, flush, isDirty };
}
