import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import arrowBackSvg from '@material-symbols/svg-700/outlined/arrow_back.svg?raw';
import checkSvg from '@material-symbols/svg-700/outlined/check.svg?raw';
import fitScreenSvg from '@material-symbols/svg-700/outlined/fit_screen.svg?raw';
import grainSvg from '@material-symbols/svg-700/outlined/grain.svg?raw';
import grid4x4Svg from '@material-symbols/svg-700/outlined/grid_4x4.svg?raw';
import gridOnSvg from '@material-symbols/svg-700/outlined/grid_on.svg?raw';
import inkEraserSvg from '@material-symbols/svg-700/outlined/ink_eraser.svg?raw';
import inkHighlighterSvg from '@material-symbols/svg-700/outlined/ink_highlighter.svg?raw';
import inkMarkerSvg from '@material-symbols/svg-700/outlined/ink_marker.svg?raw';
import inkPenSvg from '@material-symbols/svg-700/outlined/ink_pen.svg?raw';
import expandMoreSvg from '@material-symbols/svg-700/outlined/keyboard_arrow_down.svg?raw';
import expandLessSvg from '@material-symbols/svg-700/outlined/keyboard_arrow_up.svg?raw';
import moreSvg from '@material-symbols/svg-700/outlined/more_vert.svg?raw';
import progressActivitySvg from '@material-symbols/svg-700/outlined/progress_activity.svg?raw';
import redoSvg from '@material-symbols/svg-700/outlined/redo.svg?raw';
import removeSvg from '@material-symbols/svg-700/outlined/remove.svg?raw';
import tableRowsSvg from '@material-symbols/svg-700/outlined/table_rows.svg?raw';
import undoSvg from '@material-symbols/svg-700/outlined/undo.svg?raw';
import type { DrawingBackground, DrawingData, DrawingStroke, DrawingTool } from '@openkeep/shared';
import { LIMITS } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { fetchDrawingData } from '../../lib/attachments-api.js';
import {
  createStrokeModeler,
  DRAWING_CANVAS_BG,
  DRAWING_COLORS,
  DRAWING_SIZES,
  drawGrid,
  drawStroke,
  drawStrokes,
  exportDrawingPng,
  strokeHitsPoint,
  TOOL_DEFAULTS,
  TOOL_WIDTH_FACTOR,
} from '../../lib/drawing.js';
import {
  clampView,
  type DrawingView,
  fitView,
  panView,
  ZOOM_STEP,
  zoomAt,
} from '../../lib/drawing-view.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { Icon } from '../Icon.js';

const EMPTY_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

type UndoOp =
  | { kind: 'add'; stroke: DrawingStroke }
  | { kind: 'erase'; entries: { index: number; stroke: DrawingStroke }[] }
  | { kind: 'clear'; strokes: DrawingStroke[] };

type PanelId = DrawingTool | 'eraser' | 'grid' | null;

const TOOLBAR_H = 56;

const GRID_OPTIONS: { id: DrawingBackground; svg: string | null }[] = [
  { id: 'squares', svg: grid4x4Svg },
  { id: 'dots', svg: grainSvg },
  { id: 'rules', svg: tableRowsSvg },
  { id: 'none', svg: null },
];

/** Route-driven: mounted when `?drawing=new|<attachmentId>` is present. */
export function DrawingScreen() {
  const search = useSearch({ strict: false }) as { note?: string; drawing?: string };
  if (!search.drawing) return null;
  return (
    <DrawingEditor
      key={`${search.note ?? 'pending'}:${search.drawing}`}
      noteId={search.note}
      drawingId={search.drawing === 'new' ? null : search.drawing}
    />
  );
}

function DrawingEditor({ noteId, drawingId }: { noteId?: string; drawingId: string | null }) {
  const { t } = useTranslation('drawing');
  const navigate = useNavigate();
  const show = useSnackbarStore((s) => s.show);
  const noteM = useNoteMutations();
  const attachmentM = useAttachmentMutations();
  useKeyScope('editor', EMPTY_BINDINGS);
  const [, force] = useReducer((n: number) => n + 1, 0);

  const [tool, setTool] = useState<DrawingTool | 'eraser'>('pen');
  const [panel, setPanel] = useState<PanelId>(null);
  const [toolState, setToolState] = useState(TOOL_DEFAULTS);
  const [background, setBackground] = useState<DrawingBackground>('none');
  const [saving, setSaving] = useState(false);

  // Strokes and history live in refs: pointer-move must never re-render React.
  const strokesRef = useRef<DrawingStroke[]>([]);
  const undoRef = useRef<UndoOp[]>([]);
  const redoRef = useRef<UndoOp[]>([]);
  const currentRef = useRef<DrawingStroke | null>(null);
  const modelerRef = useRef(createStrokeModeler());
  const eraseRef = useRef<{ index: number; stroke: DrawingStroke }[] | null>(null);
  const dirtyRef = useRef(false);
  const doneRef = useRef(false);

  // Canvas geometry: a fixed logical page, letterbox-fitted to the viewport.
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(() =>
    drawingId
      ? null
      : {
          width: Math.max(320, Math.round(window.innerWidth)),
          height: Math.max(320, Math.round(window.innerHeight - TOOLBAR_H)),
        },
  );
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<DrawingView>({ scale: 1, offX: 0, offY: 0 });
  const frameRef = useRef(0);
  const staticFrameRef = useRef(0);

  // Pan/zoom. The view stays fit-to-viewport (and re-fits on resize) until the
  // person takes it over; from then on a resize only re-clamps what they chose.
  const vpRef = useRef({ w: 0, h: 0 });
  const fittedRef = useRef(true);
  const [zoom, setZoom] = useState(1);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pinchRef = useRef<{ dist: number; scale: number; px: number; py: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  spaceRef.current = spaceHeld;

  // Re-editing: load the stored strokes once.
  const existing = useQuery({
    queryKey: ['drawing', drawingId],
    queryFn: () => fetchDrawingData(drawingId as string),
    enabled: drawingId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const exitTo = (extra: Record<string, unknown> = {}) =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, drawing: undefined, ...extra }),
      replace: true,
      resetScroll: false,
    });

  useEffect(() => {
    if (!existing.data || metaRef.current) return;
    strokesRef.current = existing.data.strokes.map((s) => ({ ...s, points: [...s.points] }));
    setBackground(existing.data.background);
    setMeta({ width: existing.data.width, height: existing.data.height });
  }, [existing.data]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: exits once, on load error only
  useEffect(() => {
    if (!existing.isError || doneRef.current) return;
    doneRef.current = true;
    show({ message: t('loadFailed') });
    exitTo();
  }, [existing.isError]);

  const applyView = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = window.devicePixelRatio || 1;
    const { scale, offX, offY } = viewRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    return ctx;
  };

  const clipToPage = (ctx: CanvasRenderingContext2D) => {
    const m = metaRef.current;
    if (!m) return;
    ctx.beginPath();
    ctx.rect(0, 0, m.width, m.height);
    ctx.clip();
  };

  const redrawStatic = () => {
    const canvas = staticCanvasRef.current;
    const m = metaRef.current;
    if (!canvas || !m) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const view = applyView(canvas);
    if (!view) return;
    view.fillStyle = DRAWING_CANVAS_BG;
    view.fillRect(0, 0, m.width, m.height);
    drawGrid(view, backgroundRef.current, m.width, m.height);
    view.save();
    clipToPage(view);
    drawStrokes(view, strokesRef.current);
    view.restore();
  };

  const redrawLive = () => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cur = currentRef.current;
    if (!cur) return;
    const view = applyView(canvas);
    if (!view) return;
    view.save();
    clipToPage(view);
    drawStroke(view, cur);
    view.restore();
  };

  const scheduleLive = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      redrawLive();
    });
  };

  // Panning repaints every stroke, so it goes through a frame too.
  const scheduleStatic = () => {
    if (staticFrameRef.current) return;
    staticFrameRef.current = requestAnimationFrame(() => {
      staticFrameRef.current = 0;
      redrawStatic();
    });
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      cancelAnimationFrame(staticFrameRef.current);
    },
    [],
  );

  const commitView = (next: DrawingView) => {
    const m = metaRef.current;
    if (!m) return;
    viewRef.current = clampView(next, m, vpRef.current.w, vpRef.current.h);
    setZoom(viewRef.current.scale);
    scheduleStatic();
    scheduleLive();
  };

  /** Zoom about a container point (the pointer), or about the middle. */
  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const m = metaRef.current;
    if (!m) return;
    const { w, h } = vpRef.current;
    fittedRef.current = false;
    const at = zoomAt(
      viewRef.current,
      m,
      w,
      h,
      viewRef.current.scale * factor,
      cx ?? w / 2,
      cy ?? h / 2,
    );
    commitView(at);
  };

  const panBy = (dx: number, dy: number) => {
    const m = metaRef.current;
    if (!m) return;
    fittedRef.current = false;
    commitView(panView(viewRef.current, m, vpRef.current.w, vpRef.current.h, dx, dy));
  };

  const fitToScreen = () => {
    const m = metaRef.current;
    if (!m) return;
    fittedRef.current = true;
    commitView(fitView(m, vpRef.current.w, vpRef.current.h));
  };

  // Fit the logical page to the viewport (letterboxed, centered).
  // biome-ignore lint/correctness/useExhaustiveDependencies: relayout when the page size becomes known
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !meta) return;
    const layout = () => {
      const vw = el.clientWidth;
      const vh = el.clientHeight;
      if (vw === 0 || vh === 0) return;
      const dpr = window.devicePixelRatio || 1;
      vpRef.current = { w: vw, h: vh };
      viewRef.current = fittedRef.current
        ? fitView(meta, vw, vh)
        : clampView(viewRef.current, meta, vw, vh);
      setZoom(viewRef.current.scale);
      for (const canvas of [staticCanvasRef.current, liveCanvasRef.current]) {
        if (!canvas) continue;
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
        canvas.style.width = `${vw}px`;
        canvas.style.height = `${vh}px`;
      }
      redrawStatic();
      redrawLive();
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    return () => ro.disconnect();
  }, [meta]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: repaint when the paper pattern changes
  useEffect(() => {
    redrawStatic();
  }, [background, meta]);

  // Wheel: ctrl/⌘ zooms at the pointer, bare scroll pans (Figma's bargain).
  // Attached by hand because React's onWheel is passive — it cannot stop the
  // browser from zooming the whole page out from under the canvas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read refs
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vpRef.current.h : 1;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomBy(Math.exp((-e.deltaY * unit) / 260), e.clientX - rect.left, e.clientY - rect.top);
      } else {
        panBy(-e.deltaX * unit, -e.deltaY * unit);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toCanvasPoint = (e: { clientX: number; clientY: number }): [number, number] => {
    const canvas = liveCanvasRef.current;
    const m = metaRef.current;
    if (!canvas || !m) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const { scale, offX, offY } = viewRef.current;
    const x = (e.clientX - rect.left - offX) / scale;
    const y = (e.clientY - rect.top - offY) / scale;
    return [Math.min(Math.max(x, 0), m.width), Math.min(Math.max(y, 0), m.height)];
  };

  const eraseAt = (x: number, y: number) => {
    const hits = eraseRef.current;
    if (!hits) return;
    let removed = false;
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const s = strokesRef.current[i];
      if (s && strokeHitsPoint(s, x, y, 10)) {
        hits.push({ index: i, stroke: s });
        strokesRef.current.splice(i, 1);
        removed = true;
      }
    }
    if (removed) redrawStatic();
  };

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const commitStroke = () => {
    const cur = currentRef.current;
    currentRef.current = null;
    if (!cur || cur.points.length < 2) {
      redrawLive();
      return;
    }
    strokesRef.current.push(cur);
    undoRef.current.push({ kind: 'add', stroke: cur });
    redoRef.current = [];
    const canvas = staticCanvasRef.current;
    if (canvas) {
      const view = applyView(canvas);
      if (view) {
        view.save();
        clipToPage(view);
        drawStroke(view, cur);
        view.restore();
      }
    }
    redrawLive();
    markDirty();
    force();
  };

  /** Drop whatever gesture is mid-flight (a second finger landed, say). */
  const abandonGesture = () => {
    currentRef.current = null;
    eraseRef.current = null;
    redrawLive();
  };

  /** Two fingers: zoom+pan together, anchored on the page point they grabbed. */
  const startPinch = () => {
    const m = metaRef.current;
    const [a, b] = [...pointersRef.current.values()];
    if (!m || !a || !b) return;
    abandonGesture();
    panRef.current = null;
    fittedRef.current = false;
    const rect = liveCanvasRef.current?.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - (rect?.left ?? 0);
    const my = (a.y + b.y) / 2 - (rect?.top ?? 0);
    const { scale, offX, offY } = viewRef.current;
    pinchRef.current = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale,
      px: (mx - offX) / scale,
      py: (my - offY) / scale,
    };
  };

  const applyPinch = () => {
    const m = metaRef.current;
    const p = pinchRef.current;
    const [a, b] = [...pointersRef.current.values()];
    if (!m || !p || !a || !b) return;
    const rect = liveCanvasRef.current?.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - (rect?.left ?? 0);
    const my = (a.y + b.y) / 2 - (rect?.top ?? 0);
    const scale = p.scale * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist);
    // Keep the pinched page point under the fingers' midpoint as it travels.
    commitView({ scale, offX: mx - p.px * scale, offY: my - p.py * scale });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (saving || !metaRef.current) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 2) {
      startPinch();
      return;
    }
    if (pointersRef.current.size > 2) return;
    // Middle drag and space-drag pan, the way every canvas app does it.
    if (e.button === 1 || spaceRef.current) {
      e.preventDefault();
      abandonGesture();
      panRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const [x, y] = toCanvasPoint(e);
    if (tool === 'eraser') {
      eraseRef.current = [];
      eraseAt(x, y);
      return;
    }
    if (strokesRef.current.length >= LIMITS.drawingStrokesMax) return;
    const state = toolState[tool];
    modelerRef.current = createStrokeModeler();
    const [mx, my] = modelerRef.current.next(x, y);
    currentRef.current = {
      tool,
      color: state.color,
      size: (DRAWING_SIZES[state.sizeIndex] ?? 4) * TOOL_WIDTH_FACTOR[tool],
      points: [mx, my],
    };
    scheduleLive();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current) {
      applyPinch();
      return;
    }
    const p = panRef.current;
    if (p) {
      panBy(e.clientX - p.x, e.clientY - p.y);
      panRef.current = { pointerId: p.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    const events =
      'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
    if (eraseRef.current) {
      for (const ev of events) {
        const [x, y] = toCanvasPoint(ev);
        eraseAt(x, y);
      }
      return;
    }
    const cur = currentRef.current;
    if (!cur) return;
    for (const ev of events) {
      if (cur.points.length >= LIMITS.drawingPointsPerStrokeMax * 2) break;
      const [x, y] = toCanvasPoint(ev);
      const [mx, my] = modelerRef.current.next(x, y);
      const lastX = cur.points[cur.points.length - 2] ?? Number.NaN;
      const lastY = cur.points[cur.points.length - 1] ?? Number.NaN;
      if (Math.hypot(mx - lastX, my - lastY) < 0.35) continue;
      cur.points.push(mx, my);
    }
    scheduleLive();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pinchRef.current) {
      // The finger left over must not become a stroke: it keeps panning until
      // it lifts too (lifting one finger of a pinch is never a draw gesture).
      pinchRef.current = null;
      const rest = [...pointersRef.current.entries()][0];
      if (rest) panRef.current = { pointerId: rest[0], x: rest[1].x, y: rest[1].y };
      return;
    }
    if (panRef.current?.pointerId === e.pointerId) {
      panRef.current = null;
      return;
    }
    if (eraseRef.current) {
      if (eraseRef.current.length > 0) {
        undoRef.current.push({ kind: 'erase', entries: eraseRef.current });
        redoRef.current = [];
        markDirty();
        force();
      }
      eraseRef.current = null;
      return;
    }
    const cur = currentRef.current;
    if (cur) {
      // Land exactly where the pointer lifted (the modeler trails behind).
      const [x, y] = toCanvasPoint(e);
      if (cur.points.length < LIMITS.drawingPointsPerStrokeMax * 2) cur.points.push(x, y);
      commitStroke();
    }
  };

  const undo = () => {
    const op = undoRef.current.pop();
    if (!op) return;
    if (op.kind === 'add') {
      const idx = strokesRef.current.lastIndexOf(op.stroke);
      if (idx >= 0) strokesRef.current.splice(idx, 1);
    } else if (op.kind === 'erase') {
      for (const entry of [...op.entries].sort((a, b) => a.index - b.index)) {
        strokesRef.current.splice(
          Math.min(entry.index, strokesRef.current.length),
          0,
          entry.stroke,
        );
      }
    } else {
      strokesRef.current.push(...op.strokes);
    }
    redoRef.current.push(op);
    redrawStatic();
    markDirty();
    force();
  };

  const redo = () => {
    const op = redoRef.current.pop();
    if (!op) return;
    if (op.kind === 'add') {
      strokesRef.current.push(op.stroke);
    } else if (op.kind === 'erase') {
      for (const entry of op.entries) {
        const idx = strokesRef.current.indexOf(entry.stroke);
        if (idx >= 0) strokesRef.current.splice(idx, 1);
      }
    } else {
      strokesRef.current = [];
    }
    undoRef.current.push(op);
    redrawStatic();
    markDirty();
    force();
  };

  const clearPage = () => {
    setPanel(null);
    if (strokesRef.current.length === 0) return;
    undoRef.current.push({ kind: 'clear', strokes: strokesRef.current });
    redoRef.current = [];
    strokesRef.current = [];
    redrawStatic();
    markDirty();
    force();
  };

  const snapshot = (): DrawingData => {
    const m = metaRef.current ?? { width: 320, height: 320 };
    return {
      version: 1,
      width: m.width,
      height: m.height,
      background: backgroundRef.current,
      strokes: strokesRef.current.slice(0, LIMITS.drawingStrokesMax),
    };
  };

  /** Render + upload; returns the note that owns the drawing (created if needed). */
  const persist = async (): Promise<{ noteId: string }> => {
    const data = snapshot();
    const blob = await exportDrawingPng(data);
    const file = new File([blob], 'drawing.png', { type: 'image/png' });
    if (drawingId && noteId) {
      await attachmentM.updateDrawing.mutateAsync({
        noteId,
        attachmentId: drawingId,
        file,
        drawing: data,
      });
      return { noteId };
    }
    if (noteId) {
      await attachmentM.uploadDrawing.mutateAsync({ noteId, file, drawing: data });
      return { noteId };
    }
    const id = noteM.newNoteId();
    await noteM.create.mutateAsync({
      id,
      type: 'text',
      title: '',
      bodyHtml: '',
      items: [],
      pinned: false,
      color: 'default',
      background: 'none',
    });
    await attachmentM.uploadDrawing.mutateAsync({ noteId: id, file, drawing: data });
    return { noteId: id };
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;

  // Browser-back mid-draw: mutations outlive the component, so a dirty page
  // still lands (Keep saves drawings implicitly — there is no discard).
  useEffect(
    () => () => {
      if (doneRef.current || !dirtyRef.current) return;
      persistRef.current().catch(() => undefined);
    },
    [],
  );

  const saveAndExit = async () => {
    if (doneRef.current || saving) return;
    // Nothing drawn on a fresh page: no note, no attachment (Keep discards).
    if (strokesRef.current.length === 0 && !drawingId) {
      doneRef.current = true;
      if (!noteId) {
        show({ message: t('notes:emptyNoteDiscarded') });
        exitTo({ note: undefined, new: undefined });
      } else {
        exitTo();
      }
      return;
    }
    setSaving(true);
    doneRef.current = true;
    try {
      const target = await persist();
      exitTo(noteId ? {} : { note: target.noteId });
    } catch {
      doneRef.current = false;
      setSaving(false);
    }
  };

  /** Keep's "New drawing": persist this page, then open a fresh one. */
  const newDrawing = async () => {
    if (saving) return;
    if (strokesRef.current.length === 0 && !drawingId) return;
    setSaving(true);
    doneRef.current = true;
    try {
      const target = await persist();
      void navigate({
        to: '.',
        search: (old: Record<string, unknown>) => ({
          ...old,
          note: target.noteId,
          drawing: 'new',
        }),
        replace: true,
        resetScroll: false,
      });
    } catch {
      doneRef.current = false;
      setSaving(false);
    }
  };

  const exportAsImage = async () => {
    const blob = await exportDrawingPng(snapshot());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const deleteCurrentDrawing = () => {
    doneRef.current = true;
    if (drawingId && noteId) {
      attachmentM.remove.mutate({ noteId, attachmentId: drawingId });
    }
    if (!noteId) exitTo({ note: undefined, new: undefined });
    else exitTo();
  };

  // Escape saves-and-closes; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y drive history;
  // Ctrl +/-/0 drive the zoom and space is the pan modifier.
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read refs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setSpaceHeld(true);
      } else if (e.key === 'Escape' && panel === null) {
        e.preventDefault();
        void saveAndExit();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomBy(1 / ZOOM_STEP);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        fitToScreen();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        e.preventDefault();
        redo();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    // A tab-away swallows the keyup, and a stuck space would eat every stroke.
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [panel, saving]);

  const busy = saving || (drawingId !== null && !meta);

  const setToolColor = (color: string) =>
    setToolState((s) => (tool === 'eraser' ? s : { ...s, [tool]: { ...s[tool], color } }));
  const setToolSize = (sizeIndex: number) =>
    setToolState((s) => (tool === 'eraser' ? s : { ...s, [tool]: { ...s[tool], sizeIndex } }));

  const toolButton = (id: DrawingTool | 'eraser', svg: string, label: string) => (
    <Popover.Root
      open={panel === id}
      onOpenChange={(open) => {
        if (!open) {
          setPanel((p) => (p === id ? null : p));
          return;
        }
        if (tool === id) setPanel(id);
        else setTool(id);
      }}
    >
      <Popover.Trigger
        aria-label={label}
        data-tooltip={label}
        className={`inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#444746] outline-none transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary) ${
          tool === id ? 'bg-black/10' : ''
        }`}
      >
        <Icon svg={svg} size={22} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-[80]" sideOffset={6} align="start">
          <Popover.Popup className="rounded-lg border border-[#dadce0] bg-white p-2 shadow-(--elevation-3)">
            {id === 'eraser' ? (
              <button
                type="button"
                onClick={clearPage}
                className="flex h-10 items-center rounded px-3 text-[#202124] text-sm hover:bg-black/5"
              >
                {t('clearPage')}
              </button>
            ) : (
              <PalettePanel
                color={toolState[id as DrawingTool].color}
                sizeIndex={toolState[id as DrawingTool].sizeIndex}
                onColor={setToolColor}
                onSize={setToolSize}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#e9eaed]">
      <header className="flex h-14 flex-none items-center gap-1 border-[#dadce0] border-b bg-white px-2">
        <button
          type="button"
          aria-label={t('common:back')}
          onClick={() => void saveAndExit()}
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#444746] outline-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary)"
        >
          <Icon svg={arrowBackSvg} size={22} />
        </button>

        <div className="ml-2 flex items-center gap-1">
          {toolButton('eraser', inkEraserSvg, t('eraser'))}
          {toolButton('pen', inkPenSvg, t('pen'))}
          {toolButton('marker', inkMarkerSvg, t('marker'))}
          {toolButton('highlighter', inkHighlighterSvg, t('highlighter'))}

          <Popover.Root
            open={panel === 'grid'}
            onOpenChange={(open) => setPanel(open ? 'grid' : null)}
          >
            <Popover.Trigger
              aria-label={t('grid')}
              data-tooltip={t('grid')}
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#444746] outline-none transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary)"
            >
              <Icon svg={gridOnSvg} size={22} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner className="z-[80]" sideOffset={6} align="start">
                <Popover.Popup className="rounded-lg bg-[#2e2f31] p-3 text-white shadow-(--elevation-3)">
                  <div className="flex items-start gap-3">
                    {GRID_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setBackground(opt.id);
                          markDirty();
                        }}
                        className="group flex w-16 flex-col items-center gap-1.5 outline-none"
                      >
                        <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#444746] group-focus-visible:ring-2 group-focus-visible:ring-(--primary)">
                          {opt.svg && <Icon svg={opt.svg} size={24} />}
                          {background === opt.id && (
                            <span className="-top-0.5 -right-0.5 absolute flex h-5 w-5 items-center justify-center rounded-full bg-(--primary) text-white">
                              <Icon svg={checkSvg} size={14} />
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-xs ${background === opt.id ? 'font-semibold' : 'text-white/85'}`}
                        >
                          {t(`grid_${opt.id}`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label={t('editor:undo')}
            data-tooltip={t('editor:undo')}
            disabled={undoRef.current.length === 0}
            onClick={undo}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#444746] outline-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-40"
          >
            <Icon svg={undoSvg} size={22} />
          </button>
          <button
            type="button"
            aria-label={t('editor:redo')}
            data-tooltip={t('editor:redo')}
            disabled={redoRef.current.length === 0}
            onClick={redo}
            className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#444746] outline-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-40"
          >
            <Icon svg={redoSvg} size={22} />
          </button>

          <Menu.Root>
            <Menu.Trigger
              aria-label={t('notes:more')}
              data-tooltip={t('notes:more')}
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-[#444746] outline-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary)"
            >
              <Icon svg={moreSvg} size={22} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-[80]" sideOffset={2}>
                <Menu.Popup className="min-w-52 rounded-lg bg-[#2e2f31] py-1.5 text-white shadow-(--elevation-3)">
                  <Menu.Item
                    className="flex cursor-default select-none items-center px-4 py-2 text-sm outline-none data-[highlighted]:bg-white/10"
                    onClick={() => void newDrawing()}
                  >
                    {t('newDrawing')}
                  </Menu.Item>
                  <Menu.Item
                    className="flex cursor-default select-none items-center px-4 py-2 text-sm outline-none data-[highlighted]:bg-white/10"
                    onClick={() => void exportAsImage()}
                  >
                    {t('exportAsImage')}
                  </Menu.Item>
                  <Menu.Item
                    className="flex cursor-default select-none items-center px-4 py-2 text-sm outline-none data-[highlighted]:bg-white/10"
                    onClick={deleteCurrentDrawing}
                  >
                    {t('deleteCurrentDrawing')}
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </header>

      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <canvas ref={staticCanvasRef} className="absolute inset-0" aria-hidden />
        <canvas
          ref={liveCanvasRef}
          className={`absolute inset-0 touch-none ${spaceHeld ? 'cursor-grab' : 'cursor-crosshair'}`}
          aria-label={t('drawing')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        />

        <div className="absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border border-[#dadce0] bg-white p-1 shadow-(--elevation-2)">
          <ZoomButton svg={removeSvg} label={t('zoomOut')} onClick={() => zoomBy(1 / ZOOM_STEP)} />
          <span className="w-12 text-center text-[#444746] text-xs tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <ZoomButton svg={addSvg} label={t('zoomIn')} onClick={() => zoomBy(ZOOM_STEP)} />
          <ZoomButton svg={fitScreenSvg} label={t('fitToScreen')} onClick={fitToScreen} />
        </div>

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50">
            <span className="animate-spin text-[#444746] motion-reduce:animate-none">
              <Icon svg={progressActivitySvg} size={32} label={t('common:loading')} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ZoomButton({ svg, label, onClick }: { svg: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-[#444746] outline-none hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-(--primary)"
    >
      <Icon svg={svg} size={18} />
    </button>
  );
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size) as T[]);
  return rows;
}

/** Keep's tool dropdown: color rows (first row + expander) and 8 size dots. */
function PalettePanel({
  color,
  sizeIndex,
  onColor,
  onSize,
}: {
  color: string;
  sizeIndex: number;
  onColor: (c: string) => void;
  onSize: (i: number) => void;
}) {
  const { t } = useTranslation('drawing');
  const [expanded, setExpanded] = useState(
    () => (DRAWING_COLORS as readonly string[]).indexOf(color) >= 7,
  );
  const rows = chunk(DRAWING_COLORS.slice(0, expanded ? 28 : 7), 7);
  return (
    <div className="flex flex-col gap-1 p-1">
      {rows.map((row, ri) => (
        <div key={row[0]} className="flex items-center gap-1">
          {row.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${t('color')} ${c}`}
              aria-pressed={color === c}
              onClick={() => onColor(c)}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
            >
              <span
                className={`block rounded-full transition-[width,height] ${
                  color === c ? 'h-8 w-8' : 'h-6 w-6'
                } ${c === '#FFFFFF' ? 'ring-1 ring-[#dadce0]' : ''}`}
                style={{ background: c }}
              />
            </button>
          ))}
          {ri === 0 && (
            <button
              type="button"
              aria-label={expanded ? t('fewerColors') : t('moreColors')}
              onClick={() => setExpanded((v) => !v)}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[#444746] outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-(--primary)"
            >
              <Icon svg={expanded ? expandLessSvg : expandMoreSvg} size={20} />
            </button>
          )}
        </div>
      ))}
      <div className="mt-1 flex items-center gap-1">
        {DRAWING_SIZES.map((d, i) => (
          <button
            key={d}
            type="button"
            aria-label={`${t('size')} ${i + 1}`}
            aria-pressed={sizeIndex === i}
            onClick={() => onSize(i)}
            className={`flex h-9 w-9 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--primary) ${
              sizeIndex === i ? 'ring-1 ring-[#5f6368]' : 'hover:bg-black/5'
            }`}
          >
            <span className="rounded-full bg-[#202124]" style={{ width: d, height: d }} />
          </button>
        ))}
      </div>
    </div>
  );
}
