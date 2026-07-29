import type { DrawingBackground, DrawingData, DrawingStroke, DrawingTool } from '@openkeep/shared';

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

/** One stroke = one path pass, so the highlighter never darkens over itself. */
export const TOOL_ALPHA: Record<DrawingTool, number> = { pen: 1, marker: 1, highlighter: 0.45 };

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
  const step = background === 'rules' ? 32 : 24;
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 1;
  if (background === 'dots') {
    for (let y = step; y < h; y += step) {
      for (let x = step; x < w; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
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

/**
 * The note-facing PNG render: ink bounds + padding cropped out of the page
 * (Keep shows the drawing, not the whole canvas), on white, at 2× for
 * crispness. An empty page renders the full canvas.
 */
export async function exportDrawingPng(data: DrawingData): Promise<Blob> {
  const PAD = 32;
  const SCALE = 2;
  const b = inkBounds(data.strokes);
  const left = b ? Math.max(0, Math.floor(b.left - PAD)) : 0;
  const top = b ? Math.max(0, Math.floor(b.top - PAD)) : 0;
  const right = b ? Math.min(data.width, Math.ceil(b.right + PAD)) : data.width;
  const bottom = b ? Math.min(data.height, Math.ceil(b.bottom + PAD)) : data.height;
  const w = Math.max(1, right - left);
  const h = Math.max(1, bottom - top);

  const canvas = document.createElement('canvas');
  canvas.width = w * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.scale(SCALE, SCALE);
  ctx.translate(-left, -top);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top, w, h);
  drawGrid(ctx, data.background, data.width, data.height);
  drawStrokes(ctx, data.strokes);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('drawing export failed'))),
      'image/png',
    );
  });
}
