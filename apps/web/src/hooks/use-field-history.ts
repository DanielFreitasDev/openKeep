import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createHistory,
  type FieldHistory,
  type FieldSnapshot,
  recordStep,
  redoStep,
  undoStep,
} from '../lib/field-history.js';

/**
 * The editing session's title/items history (see `lib/field-history.ts`). The
 * buffer lives in a ref — it is read and written from event handlers, never
 * rendered — and only the two stack depths are state, because the toolbar
 * buttons have to grey out.
 *
 * `walk` is handed the note as it reads at that moment, so a collaborator's
 * edit that arrived between two steps lands on the opposite stack instead of
 * being quietly dropped.
 */
export function useFieldHistory(baseline: () => FieldSnapshot, resetKey: string) {
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;
  // Lazy ref init, React's documented pattern — and the baseline has to be
  // taken HERE, on the first render: read it later (on the first edit, say)
  // and the state it captures is the edited one, which would leave the first
  // change of the session with nothing behind it to go back to.
  const ref = useRef<FieldHistory | null>(null);
  if (ref.current === null) ref.current = createHistory(baseline());
  const ensure = useCallback(
    (): FieldHistory => (ref.current ??= createHistory(baselineRef.current())),
    [],
  );
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });

  const sync = useCallback(() => {
    const { past, future } = ensure();
    setDepth((prev) =>
      prev.undo === past.length && prev.redo === future.length
        ? prev
        : { undo: past.length, redo: future.length },
    );
  }, [ensure]);

  // Converting the note (text ⇄ list) rewrites its content on the server;
  // steps recorded against the shape it had can no longer be applied to it.
  const mountedRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger — a conversion, not a value the effect reads
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    ref.current = createHistory(baselineRef.current());
    sync();
  }, [resetKey, sync]);

  const record = useCallback(
    (next: FieldSnapshot, groupKey: string | null) => {
      ref.current = recordStep(ensure(), next, groupKey, Date.now());
      sync();
    },
    [ensure, sync],
  );

  const walk = useCallback(
    (dir: 'undo' | 'redo', live: FieldSnapshot): FieldSnapshot | null => {
      const next = dir === 'undo' ? undoStep(ensure(), live) : redoStep(ensure(), live);
      if (!next) return null;
      ref.current = next;
      sync();
      return next.present;
    },
    [ensure, sync],
  );

  return { record, walk, canUndo: depth.undo > 0, canRedo: depth.redo > 0 };
}
