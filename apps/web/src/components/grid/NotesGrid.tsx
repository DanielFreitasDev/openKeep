import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { FullNote } from '@openkeep/shared';
import { positionBetween } from '@openkeep/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { NoteCard } from '../notes/NoteCard.js';
import { CARD_W, columnsForWidth, GUTTER, gridWidth, layoutMasonry } from './masonry.js';

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
  /** Cards present at first paint don't replay the enter animation. */
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) initialIdsRef.current = new Set(notes.map((n) => n.id));

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
        m.patchState.mutate({ id: dragId, patch });
      },
    });
  }, [dndSection, m.patchState]);

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

  const layout = useMemo(() => {
    void measureVersion;
    const items = orderedForLayout.map((n) => ({
      id: n.id,
      height: heightsRef.current.get(n.id) ?? 120,
    }));
    return layoutMasonry(items, cols, cardW, GUTTER);
  }, [orderedForLayout, cols, cardW, measureVersion]);

  const innerW = cols === 1 ? cardW : gridWidth(cols, cardW, GUTTER);

  return (
    <div ref={containerRef} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: innerW || '100%', height: layout.containerHeight }}
      >
        {notes.map((note) => {
          const rect = layout.rects.get(note.id);
          const measured = heightsRef.current.has(note.id);
          return (
            <div
              key={note.id}
              data-note-id={note.id}
              ref={(el) => {
                if (el && cardObserver) {
                  cardObserver.observe(el);
                  const cleanups = [
                    () => {
                      cardObserver.unobserve(el);
                      heightsRef.current.delete(note.id);
                    },
                  ];
                  if (dndSection) {
                    cleanups.push(
                      draggable({
                        element: el,
                        getInitialData: () => ({ gridNoteId: note.id, gridSection: dndSection }),
                        onDragStart: () => setDraggingId(note.id),
                        onDrop: () => setDraggingId(null),
                      }),
                      dropTargetForElements({
                        element: el,
                        getData: () => ({ gridNoteId: note.id, gridSection: dndSection }),
                      }),
                    );
                  }
                  return () => {
                    for (const c of cleanups) c();
                  };
                }
                return undefined;
              }}
              className={`${
                animate && draggingId !== note.id
                  ? 'transition-transform duration-[180ms] motion-reduce:transition-none'
                  : ''
              } ${draggingId === note.id ? 'opacity-40' : ''} ${
                animate && !initialIdsRef.current?.has(note.id) ? 'note-enter' : ''
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
