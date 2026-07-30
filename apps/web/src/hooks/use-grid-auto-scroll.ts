import { autoScrollWindowForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { useEffect } from 'react';

/**
 * Keep scrolls the board while a note is held near the top or bottom of the
 * window, so a card can be dropped somewhere that was off screen when the drag
 * started — the wheel is no help there, because the browser keeps it to itself
 * for the duration of a native drag.
 *
 * The board IS the page scroller (see `use-marquee-selection`, which does the
 * same by hand for the drag-select box), so this registers once, for the
 * window. Card drags only: a checklist item dragged inside the editor scrolls
 * that modal, not the page.
 */
export function useGridAutoScroll() {
  useEffect(
    () =>
      autoScrollWindowForElements({
        canScroll: ({ source }) => typeof source.data.gridNoteId === 'string',
        getAllowedAxis: () => 'vertical',
        // 25px/frame at 60fps, matching the marquee's own edge scroll; the
        // library's default half-speed crawls on a board thousands of px tall.
        getConfiguration: () => ({ maxScrollSpeed: 'fast' }),
      }),
    [],
  );
}
