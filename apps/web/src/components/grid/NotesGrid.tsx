import type { FullNote } from '@openkeep/shared';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { NoteCard } from '../notes/NoteCard.js';
import { CARD_W, columnsForWidth, GUTTER, gridWidth, layoutMasonry } from './masonry.js';

interface NotesGridProps {
  notes: FullNote[];
  /** 'grid' measures columns from width; 'list' forces one 600px column. */
  viewMode: 'grid' | 'list';
}

/**
 * Measured masonry: absolute cards positioned via transform, driven by the
 * pure layout engine. Cards report their height through one shared
 * ResizeObserver; unmeasured cards stay invisible for their first frame.
 */
export function NotesGrid({ notes, viewMode }: NotesGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(0);
  const heightsRef = useRef(new Map<string, number>());
  const [measureVersion, bumpMeasure] = useReducer((x: number) => x + 1, 0);
  const [animate, setAnimate] = useState(false);

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

  const layout = useMemo(() => {
    void measureVersion;
    const items = notes.map((n) => ({
      id: n.id,
      height: heightsRef.current.get(n.id) ?? 120,
    }));
    return layoutMasonry(items, cols, cardW, GUTTER);
  }, [notes, cols, cardW, measureVersion]);

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
                  return () => {
                    cardObserver.unobserve(el);
                    heightsRef.current.delete(note.id);
                  };
                }
                return undefined;
              }}
              className={
                animate ? 'transition-transform duration-[180ms] motion-reduce:transition-none' : ''
              }
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
