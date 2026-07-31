/**
 * DOM side of the grid's roving tab stop. The pure direction maths lives in
 * components/grid/focus.ts; this file only reads rects and moves the caret.
 */

import type { FocusRect } from '../components/grid/focus.js';

/**
 * Every card currently in the document, in DOM order. Virtualized cards are
 * absent by design — an arrow step never crosses the render band, which
 * reaches a full screen past the viewport in both directions.
 */
export function noteCardRects(): FocusRect[] {
  const rects: FocusRect[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-note-id]')) {
    const id = el.dataset.noteId;
    if (!id) continue;
    const r = el.getBoundingClientRect();
    rects.push({ id, x: r.x, y: r.y, w: r.width, h: r.height });
  }
  return rects;
}

/** Scrolls a card into view and focuses it. False when it is not rendered. */
export function focusNoteCard(id: string): boolean {
  const el = document.querySelector(`[data-note-id="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'nearest' });
  const target = el.querySelector('[role="button"]');
  if (target instanceof HTMLElement) target.focus();
  return true;
}
