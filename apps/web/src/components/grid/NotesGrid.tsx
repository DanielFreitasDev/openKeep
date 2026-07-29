import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { FullNote } from '@openkeep/shared';
import { positionBetween } from '@openkeep/shared';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { NoteCard } from '../notes/NoteCard.js';
import { estimateNoteHeight } from './estimate.js';
import { CARD_W, columnsForWidth, GUTTER, gridWidth, layoutMasonry } from './masonry.js';

/**
 * Controls inside a card must not arm the card's native HTML5 drag: the browser
 * swallows the `click` as soon as the pointer moves a pixel or two while
 * pressed, so an ordinary (slightly imprecise) click on e.g. the pin button did
 * nothing. Cards stay draggable from anywhere else.
 */
const INTERACTIVE = 'button, a, input, textarea, select, [role="menuitem"], [contenteditable]';

/**
 * Virtualization. A card is a heavy subtree (a dozen controls, two portals and
 * its own mutation hooks), so an imported Keep account — thousands of notes —
 * cannot mount them all: every re-layout would walk the whole list. Only the
 * cards intersecting the viewport (plus a band above and below) are rendered;
 * the rest exist purely as a rect in the layout.
 */
const OVERSCAN = 900;
/** Re-slicing costs a render, so the band only follows the scroll in steps. */
const BAND_STEP = 300;
/** Below this, mounting everything is cheaper than tracking the scroll. */
const VIRTUALIZE_FROM = 60;

interface Band {
  top: number;
  bottom: number;
}

interface NotesGridProps {
  notes: FullNote[];
  /** 'grid' measures columns from width; 'list' forces one 600px column. */
  viewMode: 'grid' | 'list';
  /** Enables manual drag-reorder; 'pinned'/'others' also patches pin state. */
  dndSection?: 'pinned' | 'others';
}

/**
 * Measured masonry: absolute cards positioned via transform, driven by the
 * pure layout engine. Cards report their height through one shared
 * ResizeObserver; unmeasured cards stay invisible for their first frame.
 *
 * Every note gets a rect, but only the ones near the viewport get a card —
 * see the virtualization notes above. A rect a card has not measured yet is
 * sized by `estimateNoteHeight`.
 */
export function NotesGrid({ notes, viewMode, dndSection }: NotesGridProps) {
  const m = useNoteMutations();
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ overId: string; before: boolean } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const heightsRef = useRef(new Map<string, number>());
  const [measureVersion, bumpMeasure] = useReducer((x: number) => x + 1, 0);
  const [animate, setAnimate] = useState(false);
  const [band, setBand] = useState<Band>({ top: 0, bottom: 0 });
  /**
   * Ids the grid has already laid out once. Only a note that is NEW to the
   * list plays the enter animation — a card scrolling back into view is
   * re-mounted, not new, and must not fade in again.
   */
  const knownIdsRef = useRef<Set<string> | null>(null);
  if (knownIdsRef.current === null) knownIdsRef.current = new Set(notes.map((n) => n.id));
  const knownIds = knownIdsRef.current;

  /**
   * `useMutation` hands back a fresh object every render, so reading it
   * straight from the effect below would tear down and re-arm the drag monitor
   * on every single render (once per frame while the sidebar animates).
   */
  const patchStateRef = useRef(m.patchState);
  patchStateRef.current = m.patchState;

  /**
   * Whether the current press started on a card control. Lives in a ref because
   * `canDrag` runs from whichever draggable registration is current at dragstart
   * — a re-render between pointerdown and dragstart swaps that closure out.
   */
  const pressedControlRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
      pressedControlRef.current = (e.target as HTMLElement | null)?.closest(INTERACTIVE) != null;
    };
    el.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => el.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined) setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardObserver = useMemo(
    () =>
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver((entries) => {
            let changed = false;
            for (const entry of entries) {
              const id = (entry.target as HTMLElement).dataset.noteId;
              if (!id) continue;
              const h = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? 0);
              if (h > 0 && heightsRef.current.get(id) !== h) {
                heightsRef.current.set(id, h);
                changed = true;
              }
            }
            if (changed) bumpMeasure();
          }),
    [],
  );
  useEffect(() => () => cardObserver?.disconnect(), [cardObserver]);

  // Heights outlive their cards (a card unmounts as soon as it leaves the
  // band), so drop them when the note itself leaves the list instead.
  useEffect(() => {
    const ids = new Set(notes.map((n) => n.id));
    for (const id of heightsRef.current.keys()) {
      if (!ids.has(id)) heightsRef.current.delete(id);
    }
    for (const id of ids) knownIds.add(id);
  }, [notes, knownIds]);

  // Manual drag-reorder (per-user fractional positions). Dropping a card from
  // the other section also flips its pin (Keep behavior).
  useEffect(() => {
    if (!dndSection) return;
    return monitorForElements({
      canMonitor: ({ source }) => typeof source.data.gridNoteId === 'string',
      onDragStart: ({ source }) => setDraggingId(source.data.gridNoteId as string),
      // Live re-layout preview: while hovering this section, other cards glide
      // to show where the drop would land.
      onDrag: ({ location }) => {
        const target = location.current.dropTargets.find(
          (dt) => dt.data.gridSection === dndSection,
        );
        if (!target) {
          setDragPreview((p) => (p === null ? p : null));
          return;
        }
        const overId = target.data.gridNoteId as string;
        const rect = (target.element as HTMLElement).getBoundingClientRect();
        const before = (location.current.input.clientY ?? 0) < rect.top + rect.height / 2;
        setDragPreview((p) =>
          p?.overId === overId && p.before === before ? p : { overId, before },
        );
      },
      onDrop: ({ source, location }) => {
        setDraggingId(null);
        setDragPreview(null);
        const target = location.current.dropTargets.find(
          (dt) => dt.data.gridSection === dndSection,
        );
        if (!target) return;
        const dragId = source.data.gridNoteId as string;
        const overId = target.data.gridNoteId as string;
        if (dragId === overId) return;

        const ordered = notesRef.current.filter((n) => n.id !== dragId);
        const overIdx = ordered.findIndex((n) => n.id === overId);
        if (overIdx === -1) return;
        const rect = (target.element as HTMLElement).getBoundingClientRect();
        const pointerY = location.current.input.clientY;
        const before = pointerY < rect.top + rect.height / 2;
        const insertAt = before ? overIdx : overIdx + 1;
        const prev = ordered[insertAt - 1];
        const next = ordered[insertAt];
        const position = positionBetween(prev?.position ?? null, next?.position ?? null);

        const sourceSection = source.data.gridSection as string | undefined;
        const patch: { position: string; pinned?: boolean } = { position };
        if (sourceSection !== dndSection) patch.pinned = dndSection === 'pinned';
        patchStateRef.current.mutate({ id: dragId, patch });
      },
    });
  }, [dndSection]);

  // Enable FLIP-ish transform transitions only after the first laid-out paint.
  useEffect(() => {
    if (measureVersion > 0 && !animate) {
      const id = requestAnimationFrame(() => setAnimate(true));
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [measureVersion, animate]);

  const isNarrow = containerW <= 600 && containerW > 0;
  const cols = viewMode === 'list' || isNarrow ? 1 : columnsForWidth(containerW);
  const cardW =
    viewMode === 'list' && !isNarrow ? Math.min(600, containerW) : isNarrow ? containerW : CARD_W;

  // While dragging within this section, lay out the preview order instead.
  const orderedForLayout = useMemo(() => {
    if (!draggingId || !dragPreview || dragPreview.overId === draggingId) return notes;
    const without = notes.filter((n) => n.id !== draggingId);
    if (without.length === notes.length) return notes; // dragged card lives in the other section
    const overIdx = without.findIndex((n) => n.id === dragPreview.overId);
    const dragged = notes.find((n) => n.id === draggingId);
    if (overIdx === -1 || !dragged) return notes;
    const insertAt = dragPreview.before ? overIdx : overIdx + 1;
    return [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];
  }, [notes, draggingId, dragPreview]);

  const { layout, heights } = useMemo(() => {
    void measureVersion;
    const heightOf = new Map<string, number>();
    const items = orderedForLayout.map((n) => {
      const h = heightsRef.current.get(n.id) ?? estimateNoteHeight(n, cardW);
      heightOf.set(n.id, h);
      return { id: n.id, height: h };
    });
    return { layout: layoutMasonry(items, cols, cardW, GUTTER), heights: heightOf };
  }, [orderedForLayout, cols, cardW, measureVersion]);

  // Follow the scroll in BAND_STEP jumps: within a step the current slice
  // still covers the viewport, so no re-render is needed.
  const virtualized = notes.length >= VIRTUALIZE_FROM;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the extra deps are the re-measure trigger — the grid's own top moves when the layout above it changes (the pinned section growing, a header appearing), and no scroll event fires for that.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !virtualized) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const offset = -el.getBoundingClientRect().top;
      const next = { top: offset - OVERSCAN, bottom: offset + window.innerHeight + OVERSCAN };
      setBand((prev) =>
        Math.abs(prev.top - next.top) < BAND_STEP && Math.abs(prev.bottom - next.bottom) < BAND_STEP
          ? prev
          : next,
      );
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [virtualized, layout.containerHeight, cols, cardW]);

  const visibleNotes = useMemo(() => {
    if (!virtualized) return notes;
    return notes.filter((n) => {
      const rect = layout.rects.get(n.id);
      if (!rect) return true;
      return rect.y <= band.bottom && rect.y + (heights.get(n.id) ?? 0) >= band.top;
    });
  }, [notes, virtualized, layout, heights, band]);

  /**
   * Must stay referentially stable: React re-runs a changed ref callback on
   * every render, and re-observing a card makes the ResizeObserver re-report
   * its height — which bumps `measureVersion`, which renders again. An inline
   * callback here spins that into a 60fps render loop, and the icons React
   * re-paints each frame vanish from under the pointer, so clicks (pin,
   * archive, …) get dropped between mousedown and mouseup.
   */
  const cardRef = useCallback(
    (el: HTMLDivElement | null) => {
      const noteId = el?.dataset.noteId;
      if (!el || !noteId || !cardObserver) return undefined;
      cardObserver.observe(el);
      const cleanups = [() => cardObserver.unobserve(el)];
      if (dndSection) {
        cleanups.push(
          draggable({
            element: el,
            canDrag: () => !pressedControlRef.current,
            getInitialData: () => ({ gridNoteId: noteId, gridSection: dndSection }),
            onDragStart: () => setDraggingId(noteId),
            onDrop: () => setDraggingId(null),
          }),
          dropTargetForElements({
            element: el,
            getData: () => ({ gridNoteId: noteId, gridSection: dndSection }),
          }),
        );
      }
      return () => {
        for (const c of cleanups) c();
      };
    },
    [cardObserver, dndSection],
  );

  const innerW = cols === 1 ? cardW : gridWidth(cols, cardW, GUTTER);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: innerW || '100%', height: layout.containerHeight }}
      >
        {visibleNotes.map((note) => {
          const rect = layout.rects.get(note.id);
          const measured = heightsRef.current.has(note.id);
          return (
            <div
              key={note.id}
              data-note-id={note.id}
              // Trashed cards carry no checkbox, so the marquee skips them too.
              data-selectable={note.trashedAt === null ? '' : undefined}
              ref={cardRef}
              className={`${
                animate && draggingId !== note.id
                  ? 'transition-transform duration-[180ms] motion-reduce:transition-none'
                  : ''
              } ${draggingId === note.id ? 'opacity-40' : ''} ${
                animate && !knownIds.has(note.id) ? 'note-enter' : ''
              }`}
              style={{
                position: 'absolute',
                width: cardW,
                transform: `translate(${rect?.x ?? 0}px, ${rect?.y ?? 0}px)`,
                visibility: measured ? 'visible' : 'hidden',
              }}
            >
              <NoteCard note={note} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
