import { useEffect, useState } from 'react';

/** Motion is off when the OS asks for it (all app animations honor this). */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Enter/exit transitions for surfaces that unmount when closed (the mobile
 * drawer, the FAB menu, sheet scrims).
 *
 * `mounted` says whether to render at all — it stays true for `exitMs` after
 * the surface closes so the exit can play. `entered` drives the open-state
 * classes and only flips on the frame *after* mount, so the browser paints the
 * closed state first and has something to transition from.
 */
export function useMountTransition(
  open: boolean,
  exitMs: number,
): { mounted: boolean; entered: boolean } {
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setEntered(false);
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  useEffect(() => {
    if (!open || !mounted || entered) return;
    if (prefersReducedMotion()) {
      setEntered(true);
      return;
    }
    // Two frames: the first paints the closed state, the second flips it open.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open, mounted, entered]);

  return { mounted, entered };
}
