import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Keyed } from '../lib/reorder.js';
import { prefersReducedMotion } from './use-mount-transition.js';

/** Keep's row slide: short, and out of the way before the pointer moves again. */
const FLIP_MS = 160;
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Slide the rows into their new slots whenever the rendered order changes
 * (FLIP): every row that moved is snapped back to where it was and then
 * transitioned to zero, so the list re-flows in front of the pointer instead of
 * teleporting under it. Offsets are measured with `offsetTop`, which is layout,
 * not painting — scrolling the list mid-drag does not read as movement, and a
 * row measured while its own slide is still playing reports where it is going.
 *
 * Only armed while `active` (a drag): a row that grows because someone typed
 * into it must not send the rest of the list sliding.
 */
export function useReorderFlip(
  elements: React.RefObject<Map<string, HTMLElement>>,
  rows: readonly Keyed[],
  active: boolean,
): void {
  const previous = useRef<Map<string, number> | null>(null);
  const frames = useRef<number[]>([]);

  useLayoutEffect(() => {
    const map = elements.current;
    if (!map || !active || prefersReducedMotion()) {
      previous.current = null;
      return;
    }

    const now = new Map<string, number>();
    for (const row of rows) {
      const el = map.get(row.key);
      if (el) now.set(row.key, el.offsetTop);
    }
    const before = previous.current;
    previous.current = now;
    // The first measurement of a drag is the baseline, not a move.
    if (!before) return;

    for (const [key, top] of now) {
      const was = before.get(key);
      const el = map.get(key);
      if (!el || was === undefined || was === top) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${was - top}px)`;
      frames.current.push(
        requestAnimationFrame(() => {
          el.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASING}`;
          el.style.transform = '';
        }),
      );
    }
  }, [rows, active, elements]);

  // The drop commits the order the preview was already showing, so there is
  // nothing left to animate — just the inline styles to hand back.
  useEffect(() => {
    if (active) return;
    for (const frame of frames.current) cancelAnimationFrame(frame);
    frames.current = [];
    for (const el of elements.current?.values() ?? []) {
      el.style.transition = '';
      el.style.transform = '';
    }
  }, [active, elements]);
}
