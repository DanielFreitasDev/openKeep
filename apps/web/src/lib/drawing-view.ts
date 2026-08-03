/**
 * The drawing canvas viewport: the transform that maps the logical page (page
 * pixels, the coordinates strokes are stored in) onto the container (CSS
 * pixels). Kept pure and apart from the editor so the pan/zoom arithmetic —
 * the part that is easy to get subtly wrong — is unit-testable.
 */
export interface DrawingView {
  scale: number;
  offX: number;
  offY: number;
}

export interface DrawingSize {
  width: number;
  height: number;
}

/** Zoom ceiling; the floor is whatever shows the whole page (Keep's "Fit"). */
export const MAX_ZOOM = 8;

/** Wheel/button zoom step (a quarter closer, or its exact inverse back). */
export const ZOOM_STEP = 1.25;

/** The scale at which the whole page fits inside the container. */
export function fitScale(page: DrawingSize, vw: number, vh: number): number {
  if (page.width <= 0 || page.height <= 0 || vw <= 0 || vh <= 0) return 1;
  return Math.min(vw / page.width, vh / page.height);
}

/** Zooming out past "the whole page is visible" buys nothing, so it is the floor. */
export function clampScale(scale: number, page: DrawingSize, vw: number, vh: number): number {
  const min = fitScale(page, vw, vh);
  return Math.min(Math.max(scale, min), Math.max(min, MAX_ZOOM));
}

/**
 * Centre the page on an axis it does not fill, and forbid gaps on one it does:
 * panning can never park the paper half off-screen.
 */
function clampAxis(off: number, pageLen: number, viewLen: number): number {
  if (pageLen <= viewLen) return (viewLen - pageLen) / 2;
  return Math.min(0, Math.max(viewLen - pageLen, off));
}

export function clampView(
  view: DrawingView,
  page: DrawingSize,
  vw: number,
  vh: number,
): DrawingView {
  const scale = clampScale(view.scale, page, vw, vh);
  return {
    scale,
    offX: clampAxis(view.offX, page.width * scale, vw),
    offY: clampAxis(view.offY, page.height * scale, vh),
  };
}

/** The whole page, letterboxed and centred. */
export function fitView(page: DrawingSize, vw: number, vh: number): DrawingView {
  const scale = fitScale(page, vw, vh);
  return {
    scale,
    offX: (vw - page.width * scale) / 2,
    offY: (vh - page.height * scale) / 2,
  };
}

/** Zoom keeping the page point under (cx, cy) — container pixels — pinned there. */
export function zoomAt(
  view: DrawingView,
  page: DrawingSize,
  vw: number,
  vh: number,
  nextScale: number,
  cx: number,
  cy: number,
): DrawingView {
  const scale = clampScale(nextScale, page, vw, vh);
  const px = (cx - view.offX) / view.scale;
  const py = (cy - view.offY) / view.scale;
  return clampView({ scale, offX: cx - px * scale, offY: cy - py * scale }, page, vw, vh);
}

/** Pan by a container-pixel delta. */
export function panView(
  view: DrawingView,
  page: DrawingSize,
  vw: number,
  vh: number,
  dx: number,
  dy: number,
): DrawingView {
  return clampView({ ...view, offX: view.offX + dx, offY: view.offY + dy }, page, vw, vh);
}
