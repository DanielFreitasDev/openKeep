import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import chevronLeftSvg from '@material-symbols/svg-700/outlined/chevron_left.svg?raw';
import chevronRightSvg from '@material-symbols/svg-700/outlined/chevron_right.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import drawSvg from '@material-symbols/svg-700/outlined/draw.svg?raw';
import fitScreenSvg from '@material-symbols/svg-700/outlined/fit_screen.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import removeSvg from '@material-symbols/svg-700/outlined/remove.svg?raw';
import type { Attachment } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { attachmentFileUrl } from '../../lib/attachments-api.js';
import { canEditContent } from '../../lib/note-permissions.js';
import { selectImageStack } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';

const EMPTY_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

const ZOOM_MIN = 1;
const ZOOM_MAX = 5;
const ZOOM_STEP = 1.25;

/** Route-driven: mounted when `?viewer=<attachmentId>` rides along with `?note`. */
export function PhotoViewer() {
  const search = useSearch({ strict: false }) as { note?: string; viewer?: string };
  if (!search.note || !search.viewer) return null;
  return <Viewer noteId={search.note} attachmentId={search.viewer} />;
}

/**
 * Keep's picture viewer: one image on a dark screen, the rest of the note's
 * pictures an arrow away, with zoom for the ones whose detail matters. The
 * note editor stands down while this is up (see EditorModal), so closing it
 * lands back on the note it came from.
 */
function Viewer({ noteId, attachmentId }: { noteId: string; attachmentId: string }) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const { data: notes, isSuccess } = useQuery(notesQuery);
  const note = notes?.find((n) => n.id === noteId);
  const images = note ? selectImageStack(note.attachments) : [];
  const index = images.findIndex((a) => a.id === attachmentId);
  const current = images[index];
  useKeyScope('editor', EMPTY_BINDINGS);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const close = () =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, viewer: undefined }),
      resetScroll: false,
    });

  /** The picture just went away (deleted here or by a collaborator). */
  useEffect(() => {
    if (isSuccess && !current) close();
  });

  // A different picture starts fresh, not at the last one's magnification.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the id IS the trigger
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [attachmentId]);

  const show = (att: Attachment | undefined) => {
    if (!att) return;
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, viewer: att.id }),
      resetScroll: false,
    });
  };
  const step = (delta: number) => {
    if (images.length < 2) return;
    show(images[(index + delta + images.length) % images.length]);
  };

  const zoomBy = (factor: number) =>
    setZoom((z) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor));
      if (next === ZOOM_MIN) setPan({ x: 0, y: 0 });
      return next;
    });
  const fitToScreen = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Keys reach the viewer wherever the focus sits, the way a full-screen
  // surface with no fields of its own should behave.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === '+' || e.key === '=') zoomBy(ZOOM_STEP);
      else if (e.key === '-') zoomBy(1 / ZOOM_STEP);
      else if (e.key === '0') fitToScreen();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  if (!note || !current) return null;

  /** Ink over this picture — the same door the note's own overlay opens. */
  const draw = () =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({
        ...old,
        viewer: undefined,
        drawing: current.kind === 'drawing' ? current.id : 'new',
        photo: current.kind === 'drawing' ? undefined : current.id,
      }),
      resetScroll: false,
    });

  const barButton = (svg: string, label: string, onClick: () => void, disabled = false) => (
    <IconButton
      svg={svg}
      label={label}
      size={40}
      iconSize={22}
      disabled={disabled}
      className="text-white hover:bg-white/15 focus-visible:bg-white/15"
      onClick={onClick}
    />
  );

  return (
    /* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes, and it is bound above */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={note.title || t('editor:notePlaceholder')}
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)}
    >
      <header className="flex h-14 flex-none items-center gap-2 px-2 text-white">
        {barButton(closeSvg, t('common:close'), close)}
        <Icon svg={imageSvg} size={18} />
        <span className="min-w-0 truncate text-[0.95rem]">{note.title}</span>
        {canEditContent(note) && (
          <div className="ml-auto flex items-center">
            {barButton(
              drawSvg,
              t(current.kind === 'drawing' ? 'drawing:editDrawing' : 'drawing:drawOnImage'),
              draw,
            )}
          </div>
        )}
      </header>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: same surround, same way out */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes, and it is bound above */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the picture is the thing being looked at — drag pans it, double-click zooms; every command has a button too */}
        <img
          src={attachmentFileUrl(current.id, current.updatedAt)}
          alt=""
          draggable={false}
          className={`max-h-full max-w-full select-none object-contain ${
            zoom > 1 ? 'cursor-grab' : ''
          }`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: dragRef.current ? undefined : 'transform 120ms ease-out',
          }}
          onDoubleClick={() => (zoom > 1 ? fitToScreen() : zoomBy(2))}
          onPointerDown={(e) => {
            if (zoom === 1) return;
            dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
        />

        {images.length > 1 && (
          <>
            <div className="absolute inset-y-0 left-1 flex items-center">
              {barButton(chevronLeftSvg, t('previousImage'), () => step(-1))}
            </div>
            <div className="absolute inset-y-0 right-1 flex items-center">
              {barButton(chevronRightSvg, t('nextImage'), () => step(1))}
            </div>
          </>
        )}
      </div>

      <div className="flex h-16 flex-none items-center justify-center">
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-1">
          {barButton(
            removeSvg,
            t('drawing:zoomOut'),
            () => zoomBy(1 / ZOOM_STEP),
            zoom <= ZOOM_MIN,
          )}
          {barButton(
            fitScreenSvg,
            t('drawing:fitToScreen'),
            fitToScreen,
            zoom === 1 && pan.x === 0,
          )}
          {barButton(addSvg, t('drawing:zoomIn'), () => zoomBy(ZOOM_STEP), zoom >= ZOOM_MAX)}
        </div>
      </div>
    </div>
  );
}
