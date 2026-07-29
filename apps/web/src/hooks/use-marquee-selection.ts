import { type RefObject, useEffect, useState } from 'react';
import {
  type Box,
  type BoxedNote,
  boxFromPoints,
  notesInBox,
  type Point,
  passedThreshold,
} from '../components/grid/marquee.js';
import { useSelectionStore } from '../stores/selection.js';

/**
 * A press on any of these is never a marquee: cards drag-reorder themselves,
 * controls and editable surfaces own their own pointer handling.
 */
const IGNORE =
  '[data-note-id], [data-no-marquee], button, a, input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="menuitem"]';

/** Viewport band that auto-scrolls the page while the drag is inside it. */
const EDGE = 64;
/** Auto-scroll speed at the very edge, in px per frame. */
const MAX_SPEED = 24;

interface Drag {
  pointerId: number;
  /** Anchor in page coords, so the box survives scrolling mid-drag. */
  origin: Point;
  /** Last pointer position in viewport coords (drives the auto-scroll). */
  client: Point;
  /** Selection the drag started from — a marquee only ever adds (Keep). */
  base: Set<string>;
  /** Card boxes measured once at drag start; layout can't shift mid-drag. */
  candidates: BoxedNote[];
  active: boolean;
}

/**
 * Keep's drag-select: pressing empty grid background and dragging paints a
 * rubber-band box that selects every card it touches. Both mouse buttons arm it
 * — the right one is what Keep users reach for, so the native context menu is
 * suppressed on the background (cards keep theirs).
 *
 * Returns the live box in PAGE coords, or null when no drag is in flight.
 */
export function useMarqueeSelection(containerRef: RefObject<HTMLElement | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let drag: Drag | null = null;
    let raf = 0;
    let swallowClick = false;

    /** True for background presses only — inside the grid area, off any card. */
    const eligible = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      return node != null && el.contains(node) && node.closest(IGNORE) == null;
    };

    const collect = (): BoxedNote[] =>
      Array.from(el.querySelectorAll<HTMLElement>('[data-note-id][data-selectable]')).flatMap(
        (node) => {
          const id = node.dataset.noteId;
          if (!id) return [];
          const r = node.getBoundingClientRect();
          return [
            {
              id,
              box: {
                left: r.left + window.scrollX,
                top: r.top + window.scrollY,
                width: r.width,
                height: r.height,
              },
            },
          ];
        },
      );

    const apply = () => {
      if (!drag?.active) return;
      const next = boxFromPoints(drag.origin, {
        x: drag.client.x + window.scrollX,
        y: drag.client.y + window.scrollY,
      });
      setBox(next);

      const merged = new Set(drag.base);
      for (const id of notesInBox(next, drag.candidates)) merged.add(id);
      const current = useSelectionStore.getState().selected;
      const unchanged = merged.size === current.size && [...merged].every((id) => current.has(id));
      if (!unchanged) useSelectionStore.getState().selectMany([...merged]);
    };

    const tick = () => {
      if (!drag?.active) {
        raf = 0;
        return;
      }
      const { y } = drag.client;
      const h = window.innerHeight;
      let dy = 0;
      if (y < EDGE) dy = -Math.ceil(((EDGE - y) / EDGE) * MAX_SPEED);
      else if (y > h - EDGE) dy = Math.ceil(((y - (h - EDGE)) / EDGE) * MAX_SPEED);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        apply();
      }
      raf = requestAnimationFrame(tick);
    };

    const stop = (cancelled: boolean) => {
      if (!drag) return;
      const { active, base } = drag;
      drag = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (!active) return;
      document.body.style.userSelect = '';
      setBox(null);
      if (cancelled) useSelectionStore.getState().selectMany([...base]);
      // The mouseup that ends the drag still fires a click on whatever the
      // pointer landed on; drop that one so it can't reopen/clear anything.
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, 0);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (drag || e.pointerType !== 'mouse') return;
      if (e.button !== 0 && e.button !== 2) return;
      if (!eligible(e.target)) return;
      drag = {
        pointerId: e.pointerId,
        origin: { x: e.pageX, y: e.pageY },
        client: { x: e.clientX, y: e.clientY },
        base: new Set(useSelectionStore.getState().selected),
        candidates: [],
        active: false,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag.client = { x: e.clientX, y: e.clientY };
      if (!drag.active) {
        if (!passedThreshold(drag.origin, { x: e.pageX, y: e.pageY })) return;
        drag.active = true;
        drag.candidates = collect();
        window.getSelection()?.removeAllRanges();
        document.body.style.userSelect = 'none';
        raf = requestAnimationFrame(tick);
      }
      e.preventDefault();
      apply();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      // Keep: a plain left-click on the empty grid background (a press that
      // never became a drag) clears the selection — the marquee only adds, so
      // this is the mouse user's way out short of the ✕ button.
      const plainLeftClick = !drag.active && e.type === 'pointerup' && e.button === 0;
      stop(false);
      if (plainLeftClick && useSelectionStore.getState().selected.size > 0) {
        useSelectionStore.getState().clear();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !drag) return;
      e.preventDefault();
      e.stopPropagation();
      stop(true);
    };

    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    // Right-drag can only select if the menu stays out of the way; a card's own
    // right-click still gets the browser menu.
    const onContextMenu = (e: MouseEvent) => {
      if (eligible(e.target)) e.preventDefault();
    };

    const onBlur = () => stop(false);

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('click', onClick, { capture: true });
    window.addEventListener('blur', onBlur);
    return () => {
      stop(false);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('blur', onBlur);
    };
  }, [containerRef]);

  return box;
}
