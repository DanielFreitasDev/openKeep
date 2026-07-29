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
 */
export function useAutosave(
  save: (patch: Record<string, unknown>) => void,
  delayMs = 500,
  draftId?: string,
) {
  const dirtyRef = useRef(new Map<string, unknown>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;

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
