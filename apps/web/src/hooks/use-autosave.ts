import { useCallback, useEffect, useRef } from 'react';

/**
 * Debounced per-field autosave (500 ms trailing). Only dirty fields are sent;
 * flush fires on blur/close/visibilitychange/unmount. The dirty map doubles as
 * the anti-stomp guard: remote patches must not overwrite dirty fields.
 */
export function useAutosave(save: (patch: Record<string, unknown>) => void, delayMs = 500) {
  const dirtyRef = useRef(new Map<string, unknown>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

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
