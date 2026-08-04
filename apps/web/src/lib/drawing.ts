import type { DrawingBackground, DrawingData, DrawingStroke, DrawingTool } from '@openkeep/shared';
import { DRAWING_GRID, TOOL_ALPHA } from '@openkeep/shared';

/** Keep's ink palette (sampled from keep.google.com), 4 rows × 7 swatches. */
export const DRAWING_COLORS = [
  '#000000',
  '#FF5252',
  '#FFBC00',
  '#00C853',
  '#00B0FF',
  '#D500F9',
  '#8D6E63',
  '#FFFFFF',
  '#A52714',
  '#EE8100',
  '#558B2F',
  '#01579B',
  '#8E24AA',
  '#4E342E',
  '#90A4AE',
  '#FF4081',
  '#FF6E40',
  '#AEEA00',
  '#304FFE',
  '#7C4DFF',
  '#1DE9B6',
  '#CFD8DC',
  '#F8BBD0',
  '#FFCCBC',
  '#F0F4C3',
  '#9FA8DA',
  '#D1C4E9',
  '#B2DFDB',
] as const;

/** Keep's 8 stroke sizes (dot diameters in the tool panel = pen widths). */
export const DRAWING_SIZES = [2, 4, 8, 12, 16, 20, 24, 28] as const;

/** Marker and highlighter lay down broader ink than the pen at the same dot. */
export const TOOL_WIDTH_FACTOR: Record<DrawingTool, number> = {
  pen: 1,
  marker: 2.2,
  highlighter: 2.5,
};

/** Keep's defaults: black pen, red marker, yellow highlighter. */
export const TOOL_DEFAULTS: Record<DrawingTool, { color: string; sizeIndex: number }> = {
  pen: { color: '#000000', sizeIndex: 1 },
  marker: { color: '#FF5252', sizeIndex: 1 },
  highlighter: { color: '#FFBC00', sizeIndex: 3 },
};

/** Keep's drawing paper (editor surface); exports render on plain white. */
export const DRAWING_CANVAS_BG = '#FAFAFA';

/**
 * Input smoothing in the spirit of Keep's open-source ink_stroke_modeler: the
 * modeled point chases the raw pointer with damped lag, killing hand jitter
 * without visibly trailing at touch/mouse event rates.
 */
export function createStrokeModeler() {
  let x = 0;
  let y = 0;
  let primed = false;
  return {
    next(rx: number, ry: number): [number, number] {
      if (!primed) {
        x = rx;
        y = ry;
        primed = true;
      } else {
        x += (rx - x) * 0.55;
        y += (ry - y) * 0.55;
      }
      return [x, y];
    },
  };
}

/** Paint one stroke as a single smoothed path (quadratics through midpoints). */
export function drawStroke(ctx: CanvasRenderingContext2D, s: DrawingStroke): void {
  const pts = s.points;
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalAlpha = TOOL_ALPHA[s.tool];
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.arc(pts[0] ?? 0, pts[1] ?? 0, s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
    let i = 2;
    for (; i < pts.length - 2; i += 2) {
      const mx = ((pts[i] ?? 0) + (pts[i + 2] ?? 0)) / 2;
      const my = ((pts[i + 1] ?? 0) + (pts[i + 3] ?? 0)) / 2;
      ctx.quadraticCurveTo(pts[i] ?? 0, pts[i + 1] ?? 0, mx, my);
    }
    ctx.lineTo(pts[pts.length - 2] ?? 0, pts[pts.length - 1] ?? 0);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: readonly DrawingStroke[]) {
  for (const s of strokes) drawStroke(ctx, s);
}

/** Keep's paper patterns: squares / dots / rules in light grey. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  background: DrawingBackground,
  w: number,
  h: number,
): void {
  if (background === 'none') return;
  const step = background === 'rules' ? DRAWING_GRID.stepRules : DRAWING_GRID.step;
  ctx.save();
  ctx.strokeStyle = DRAWING_GRID.lineColor;
  ctx.fillStyle = DRAWING_GRID.dotColor;
  ctx.lineWidth = 1;
  if (background === 'dots') {
    for (let y = step; y < h; y += step) {
      for (let x = step; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, DRAWING_GRID.dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.beginPath();
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    if (background === 'squares') {
      for (let x = step; x < w; x += step) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Keep's eraser removes whole strokes: true when (x,y) touches this one. */
export function strokeHitsPoint(s: DrawingStroke, x: number, y: number, radius: number): boolean {
  const r = radius + s.size / 2;
  const pts = s.points;
  if (pts.length === 2) return Math.hypot((pts[0] ?? 0) - x, (pts[1] ?? 0) - y) <= r;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    if (segDist(x, y, pts[i] ?? 0, pts[i + 1] ?? 0, pts[i + 2] ?? 0, pts[i + 3] ?? 0) <= r) {
      return true;
    }
  }
  return false;
}

/** Ray casting against a closed flat polygon [x0, y0, x1, y1, …]. */
export function pointInPolygon(poly: readonly number[], x: number, y: number): boolean {
  const n = Math.floor(poly.length / 2);
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2] ?? 0;
    const yi = poly[i * 2 + 1] ?? 0;
    const xj = poly[j * 2] ?? 0;
    const yj = poly[j * 2 + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The lasso takes a stroke only when the loop encloses all of it — the same
 * bargain Keep makes: circle what you mean, and half-crossed neighbours stay
 * put. The polygon's own box rejects most candidates before any ray casting.
 */
export function strokesInPolygon(
  strokes: readonly DrawingStroke[],
  poly: readonly number[],
): DrawingStroke[] {
  if (poly.length < 6) return [];
  let pl = Number.POSITIVE_INFINITY;
  let pt = Number.POSITIVE_INFINITY;
  let pr = Number.NEGATIVE_INFINITY;
  let pb = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < poly.length; i += 2) {
    pl = Math.min(pl, poly[i] ?? 0);
    pr = Math.max(pr, poly[i] ?? 0);
    pt = Math.min(pt, poly[i + 1] ?? 0);
    pb = Math.max(pb, poly[i + 1] ?? 0);
  }
  const picked: DrawingStroke[] = [];
  for (const s of strokes) {
    let outside = s.points.length < 2;
    for (let i = 0; !outside && i + 1 < s.points.length; i += 2) {
      const x = s.points[i] ?? 0;
      const y = s.points[i + 1] ?? 0;
      outside = x < pl || x > pr || y < pt || y > pb;
    }
    if (outside) continue;
    let all = true;
    for (let i = 0; all && i + 1 < s.points.length; i += 2) {
      all = pointInPolygon(poly, s.points[i] ?? 0, s.points[i + 1] ?? 0);
    }
    if (all) picked.push(s);
  }
  return picked;
}

/** Move a stroke in place (the lasso drag; undo replays it backwards). */
export function translateStroke(s: DrawingStroke, dx: number, dy: number): void {
  for (let i = 0; i + 1 < s.points.length; i += 2) {
    s.points[i] = (s.points[i] ?? 0) + dx;
    s.points[i + 1] = (s.points[i + 1] ?? 0) + dy;
  }
}

/** Selection chrome is measured in screen pixels, so the zoom divides out. */
const SELECTION_INK = '#1a73e8';

export function drawLassoPath(
  ctx: CanvasRenderingContext2D,
  poly: readonly number[],
  scale: number,
): void {
  if (poly.length < 4) return;
  ctx.save();
  ctx.setLineDash([6 / scale, 4 / scale]);
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = SELECTION_INK;
  ctx.beginPath();
  ctx.moveTo(poly[0] ?? 0, poly[1] ?? 0);
  for (let i = 2; i + 1 < poly.length; i += 2) ctx.lineTo(poly[i] ?? 0, poly[i + 1] ?? 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  box: { left: number; top: number; right: number; bottom: number },
  scale: number,
): void {
  const pad = 6 / scale;
  ctx.save();
  ctx.setLineDash([5 / scale, 4 / scale]);
  ctx.lineWidth = 1.5 / scale;
  ctx.strokeStyle = SELECTION_INK;
  ctx.fillStyle = 'rgba(26, 115, 232, 0.08)';
  const x = box.left - pad;
  const y = box.top - pad;
  const w = box.right - box.left + pad * 2;
  const h = box.bottom - box.top + pad * 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** Ink bounding box (stroke widths included), or null for an empty page. */
export function inkBounds(
  strokes: readonly DrawingStroke[],
): { left: number; top: number; right: number; bottom: number } | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const s of strokes) {
    const half = s.size / 2;
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      const x = s.points[i] ?? 0;
      const y = s.points[i + 1] ?? 0;
      left = Math.min(left, x - half);
      top = Math.min(top, y - half);
      right = Math.max(right, x + half);
      bottom = Math.max(bottom, y + half);
    }
  }
  return left === Number.POSITIVE_INFINITY ? null : { left, top, right, bottom };
}

export interface DrawingRender {
  blob: Blob;
  mime: string;
  ext: string;
}

/**
 * The note-facing render.
 *
 * Ink on paper is cropped to its bounds plus padding (Keep shows the drawing,
 * not the whole canvas), drawn on white at 2× for crispness, and saved as PNG.
 *
 * Ink on a photo is the whole page at 1×, because the page *is* the photo:
 * cropping would hand the note a fragment of the picture, doubling it would
 * only invent pixels, and JPEG is what a photograph belongs in — as a PNG the
 * same composite costs megabytes of somebody's quota.
 */
export async function renderDrawing(
  data: DrawingData,
  photo: CanvasImageSource | null,
): Promise<DrawingRender> {
  const overPhoto = Boolean(data.photoAttachmentId && photo);
  const PAD = 32;
  const scale = overPhoto ? 1 : 2;
  const b = overPhoto ? null : inkBounds(data.strokes);
  const left = b ? Math.max(0, Math.floor(b.left - PAD)) : 0;
  const top = b ? Math.max(0, Math.floor(b.top - PAD)) : 0;
  const right = b ? Math.min(data.width, Math.ceil(b.right + PAD)) : data.width;
  const bottom = b ? Math.min(data.height, Math.ceil(b.bottom + PAD)) : data.height;
  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.scale(scale, scale);
  ctx.translate(-left, -top);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top, w, h);
  if (overPhoto && photo) ctx.drawImage(photo, 0, 0, data.width, data.height);
  else drawGrid(ctx, data.background, data.width, data.height);
  drawStrokes(ctx, data.strokes);

  const mime = overPhoto ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (out) => (out ? resolve(out) : reject(new Error('drawing export failed'))),
      mime,
      overPhoto ? 0.9 : undefined,
    );
  });
  return { blob, mime, ext: overPhoto ? 'jpg' : 'png' };
}
