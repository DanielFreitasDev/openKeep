import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { FullNote } from '@openkeep/shared';
import { positionBetween } from '@openkeep/shared';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { useUiStore } from '../../stores/ui.js';
import { NoteCard } from '../notes/NoteCard.js';
import type { DragCard, DragSnapshot, DropTarget } from './drag.js';
import {
  buildDragSnapshot,
  dragTargetAt,
  insertIndexFor,
  previewLayout,
  sameDropTarget,
  targetForIndex,
} from './drag.js';
import { estimateNoteHeight } from './estimate.js';
import type { MasonryLayout } from './masonry.js';
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
  const focusedNoteId = useUiStore((s) => s.focusedNoteId);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const snapshotRef = useRef<DragSnapshot | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
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
   * The measurements the drag monitor freezes at dragstart (assigned below,
   * once this render's layout exists).
   */
  const geometryRef = useRef<{
    layout: MasonryLayout;
    heights: Map<string, number>;
    cols: number;
    cardW: number;
    gutter: number;
  } | null>(null);
  /**
   * Where the dragged card sits until the pointer asks for somewhere else —
   * its own slot, so picking a card up moves nothing.
   */
  const homeTargetRef = useRef<DropTarget | null>(null);
  /**
   * The gap the user can currently see. The drop follows it rather than
   * re-reading the pointer, so the card cannot land anywhere else.
   */
  const dropTargetRef = useRef<DropTarget | null>(null);

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

  // The section itself is the drop target: the gap is placed from the pointer
  // against frozen geometry (see ./drag.ts), so per-card targets would only
  // narrow the drop zone to the cards and leave the gutters dead.
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !dndSection) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({ gridSection: dndSection }),
    });
  }, [dndSection]);

  // Manual drag-reorder (per-user fractional positions). Dropping a card from
  // the other section also flips its pin (Keep behavior).
  useEffect(() => {
    if (!dndSection) return;
    /** Last pointer position, and whether it was over this section. */
    const pointer = { x: 0, y: 0, over: false };

    /** The gap the pointer is over, or null when it is not over this section. */
    const targetFor = (clientX: number, clientY: number) => {
      const snap = snapshotRef.current;
      const el = innerRef.current;
      if (!snap || !el) return null;
      const rect = el.getBoundingClientRect();
      return dragTargetAt(snap, clientX - rect.left, clientY - rect.top);
    };

    const apply = () => {
      const next = pointer.over ? targetFor(pointer.x, pointer.y) : null;
      dropTargetRef.current = next;
      setDropTarget((prev) => (sameDropTarget(prev, next) ? prev : next));
    };

    /**
     * Auto-scroll slides the board under a pointer that is holding still, and
     * the browser only re-fires `dragover` a few times a second — so the gap
     * has to follow the scroll itself or it lags whole screens behind.
     */
    const onScroll = () => {
      if (snapshotRef.current !== null) apply();
    };
    const watchScroll = (on: boolean) => {
      if (on) window.addEventListener('scroll', onScroll, { capture: true, passive: true });
      else window.removeEventListener('scroll', onScroll, { capture: true });
    };

    const cleanupMonitor = monitorForElements({
      canMonitor: ({ source }) => typeof source.data.gridNoteId === 'string',
      // Freeze the section with the dragged card out of the flow; the whole
      // drag previews against that, and nothing re-packs until the drop.
      onDragStart: ({ source }) => {
        const geometry = geometryRef.current;
        const dragId = source.data.gridNoteId as string;
        if (geometry) {
          const cards: DragCard[] = [];
          let homeIndex = -1;
          for (const note of notesRef.current) {
            if (note.id === dragId) {
              homeIndex = cards.length;
              continue;
            }
            cards.push({ id: note.id, height: geometry.heights.get(note.id) ?? 0 });
          }
          const snap = buildDragSnapshot(
            cards,
            dragId,
            // A card dragged in from the other section was never measured here.
            geometry.heights.get(dragId) ??
              Math.round(source.element.getBoundingClientRect().height),
            geometry.cols,
            geometry.cardW,
            geometry.gutter,
            geometry.layout,
          );
          snapshotRef.current = snap;
          // Inserting the card back at its own index is its current slot, so
          // this is the grid exactly as it stands.
          homeTargetRef.current = homeIndex === -1 ? null : targetForIndex(snap, homeIndex);
        }
        watchScroll(true);
        setDraggingId(dragId);
      },
      onDrag: ({ location }) => {
        pointer.x = location.current.input.clientX;
        pointer.y = location.current.input.clientY;
        pointer.over = location.current.dropTargets.some(
          (dt) => dt.data.gridSection === dndSection,
        );
        apply();
      },
      // The gap on screen is a promise, so the drop keeps it. Only a drag that
      // ended before a single frame previewed falls back to the pointer.
      onDrop: ({ source, location }) => {
        const snap = snapshotRef.current;
        const target =
          dropTargetRef.current ??
          targetFor(location.current.input.clientX, location.current.input.clientY);
        watchScroll(false);
        snapshotRef.current = null;
        homeTargetRef.current = null;
        dropTargetRef.current = null;
        setDraggingId(null);
        setDropTarget(null);
        if (!snap || !target) return;
        // A cancelled drag (Escape, dropped outside) lands on no drop target,
        // and must leave the order alone even though a gap was open.
        if (!location.current.dropTargets.some((dt) => dt.data.gridSection === dndSection)) return;

        const dragId = snap.dragId;
        const ordered = notesRef.current.filter((n) => n.id !== dragId);
        const insertAt = insertIndexFor(
          ordered.map((n) => n.id),
          target,
        );
        if (insertAt === null) return;
        const sameSection = source.data.gridSection === dndSection;
        // Re-inserting a card where it already sits is not a reorder.
        if (sameSection && insertAt === notesRef.current.findIndex((n) => n.id === dragId)) return;

        const position = positionBetween(
          ordered[insertAt - 1]?.position ?? null,
          ordered[insertAt]?.position ?? null,
        );
        const patch: { position: string; pinned?: boolean } = { position };
        if (!sameSection) patch.pinned = dndSection === 'pinned';
        patchStateRef.current.mutate({ id: dragId, patch });
      },
    });
    return () => {
      watchScroll(false);
      cleanupMonitor();
    };
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
  // Phone layout mirrors the Keep app: grid is a fixed 2-up with a tighter
  // gutter, list is one full-width column. Wide containers keep Keep-web's
  // fixed 240px columns.
  const gutter = isNarrow ? 12 : GUTTER;
  const cols = viewMode === 'list' ? 1 : isNarrow ? 2 : columnsForWidth(containerW);
  const cardW = isNarrow
    ? viewMode === 'list'
      ? containerW
      : Math.floor((containerW - gutter) / 2)
    : viewMode === 'list'
      ? Math.min(600, containerW)
      : CARD_W;

  const { layout, heights } = useMemo(() => {
    void measureVersion;
    const heightOf = new Map<string, number>();
    const items = notes.map((n) => {
      const h = heightsRef.current.get(n.id) ?? estimateNoteHeight(n, cardW);
      heightOf.set(n.id, h);
      return { id: n.id, height: h };
    });
    return { layout: layoutMasonry(items, cols, cardW, gutter), heights: heightOf };
  }, [notes, cols, cardW, gutter, measureVersion]);
  geometryRef.current = { layout, heights, cols, cardW, gutter };

  /**
   * While dragging, positions come from the frozen snapshot instead — a
   * re-measure or a note arriving mid-drag must not move the grid under the
   * pointer. A note the snapshot never saw falls back to the live layout.
   */
  const dragLayout = useMemo(() => {
    const snap = snapshotRef.current;
    if (draggingId === null || snap === null) return null;
    return previewLayout(snap, dropTarget ?? homeTargetRef.current);
  }, [draggingId, dropTarget]);

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
      // Mid-drag, a card is drawn where the preview puts it — the board can be
      // auto-scrolled thousands of px away from where the dragged card started,
      // and its own placeholder must not unmount out of the gap it is holding.
      const rect = dragLayout?.rects.get(n.id) ?? layout.rects.get(n.id);
      if (!rect) return true;
      return rect.y <= band.bottom && rect.y + (heights.get(n.id) ?? 0) >= band.top;
    });
  }, [notes, virtualized, layout, dragLayout, heights, band]);

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
          // Drag state is owned by the section monitor below: it also sees the
          // cards dragged in from the other section.
          draggable({
            element: el,
            canDrag: () => !pressedControlRef.current,
            getInitialData: () => ({ gridNoteId: noteId, gridSection: dndSection }),
          }),
        );
      }
      return () => {
        for (const c of cleanups) c();
      };
    },
    [cardObserver, dndSection],
  );

  /**
   * The grid's single tab stop (roving tabindex): the focused card when it is
   * one of ours, the first card otherwise. Tab therefore steps PAST the whole
   * grid — hundreds of cards used to be hundreds of stops — and the arrows
   * below take over from there.
   */
  const rovingId =
    focusedNoteId !== null && notes.some((n) => n.id === focusedNoteId)
      ? focusedNoteId
      : notes[0]?.id;

  const innerW = cols === 1 ? cardW : gridWidth(cols, cardW, gutter);
  // A drag never shrinks the grid: the drop target is this box, and a box that
  // shrank out from under the pointer would drop the preview it just opened.
  const containerHeight = dragLayout
    ? Math.max(dragLayout.containerHeight, snapshotRef.current?.containerHeight ?? 0)
    : layout.containerHeight;

  return (
    <div ref={containerRef} className="w-full">
      <div
        ref={innerRef}
        className="relative mx-auto"
        style={{ width: innerW || '100%', height: containerHeight }}
      >
        {visibleNotes.map((note) => {
          const rect = dragLayout?.rects.get(note.id) ?? layout.rects.get(note.id);
          const measured = heightsRef.current.has(note.id);
          const roving = note.id === rovingId;
          return (
            <div
              key={note.id}
              data-note-id={note.id}
              // Trashed cards carry no checkbox, so the marquee skips them too.
              data-selectable={note.trashedAt === null ? '' : undefined}
              ref={cardRef}
              className={`${
                animate
                  ? 'transition-transform duration-[180ms] ease-out motion-reduce:transition-none'
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
              <NoteCard note={note} roving={roving} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
