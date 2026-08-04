import { deflateSync } from 'node:zlib';
import type { DrawingData, DrawingStroke } from '@openkeep/shared';
import { DRAWING_GRID, TOOL_ALPHA } from '@openkeep/shared';

/**
 * A PNG render of a drawing's vectors, without a canvas.
 *
 * The browser editor uploads the picture its own canvas already drew; an agent
 * composing strokes through MCP has no canvas, and the API stores the render
 * beside the vectors rather than deriving one. So the strokes are rasterized
 * here — the same geometry the editor paints (round caps and joins, per-tool
 * alpha, Keep's paper patterns), just resolved per pixel instead of by a 2D
 * context. Deliberately plain: no curve smoothing, because the smoothing the
 * editor applies is a live-input concern and an authored stroke is already the
 * shape it meant.
 */

/** Distance from a point to a segment — a stroke is the union of capsules. */
function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface Canvas {
  width: number;
  height: number;
  /** RGB, 3 bytes per pixel — a drawing's paper is opaque, so no alpha plane. */
  rgb: Uint8ClampedArray;
}

function paper(width: number, height: number): Canvas {
  const rgb = new Uint8ClampedArray(width * height * 3);
  rgb.fill(255);
  return { width, height, rgb };
}

/** `#rrggbb` → components. Any other spelling is refused by the zod schema. */
function parseHex(color: string): [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

/** Source-over of one colour onto a pixel at the given coverage (0…1). */
function blend(canvas: Canvas, index: number, rgb: [number, number, number], alpha: number): void {
  if (alpha <= 0) return;
  const base = index * 3;
  for (let channel = 0; channel < 3; channel++) {
    const existing = canvas.rgb[base + channel] ?? 255;
    const ink = rgb[channel] ?? 0;
    canvas.rgb[base + channel] = existing + (ink - existing) * alpha;
  }
}

function drawGrid(canvas: Canvas, background: DrawingData['background']): void {
  if (background === 'none') return;
  const { width, height } = canvas;
  const step = background === 'rules' ? DRAWING_GRID.stepRules : DRAWING_GRID.step;
  const ink: [number, number, number] = [0, 0, 0];

  if (background === 'dots') {
    const radius = DRAWING_GRID.dotRadius;
    const reach = Math.ceil(radius + 1);
    for (let cy = step; cy < height; cy += step) {
      for (let cx = step; cx < width; cx += step) {
        for (let y = Math.max(0, cy - reach); y <= Math.min(height - 1, cy + reach); y++) {
          for (let x = Math.max(0, cx - reach); x <= Math.min(width - 1, cx + reach); x++) {
            const coverage = Math.min(
              1,
              Math.max(0, radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)),
            );
            blend(canvas, y * width + x, ink, coverage * 0.18);
          }
        }
      }
    }
    return;
  }

  // A hairline sits on the pixel the browser's `+ 0.5` offset lands it on.
  for (let y = step; y < height; y += step) {
    for (let x = 0; x < width; x++) blend(canvas, y * width + x, ink, 0.12);
  }
  if (background === 'squares') {
    for (let x = step; x < width; x += step) {
      for (let y = 0; y < height; y++) blend(canvas, y * width + x, ink, 0.12);
    }
  }
}

/**
 * One stroke, in two passes: accumulate coverage into a mask, then composite
 * the mask once. Compositing segment by segment would darken every overlap and
 * every joint, which is exactly what the editor's single-path pass avoids.
 */
function drawStroke(canvas: Canvas, mask: Uint8Array, stroke: DrawingStroke): void {
  const { width, height } = canvas;
  const points = stroke.points;
  if (points.length < 2) return;
  const radius = stroke.size / 2;
  const reach = Math.ceil(radius + 1);
  const rgb = parseHex(stroke.color);
  const alpha = TOOL_ALPHA[stroke.tool];

  let touchedLeft = width;
  let touchedTop = height;
  let touchedRight = -1;
  let touchedBottom = -1;

  // A lone point is a dot; otherwise every consecutive pair is a capsule.
  const segments = points.length === 2 ? 1 : (points.length - 2) / 2;
  for (let s = 0; s < segments; s++) {
    const ax = points[s * 2] ?? 0;
    const ay = points[s * 2 + 1] ?? 0;
    const bx = points.length === 2 ? ax : (points[s * 2 + 2] ?? ax);
    const by = points.length === 2 ? ay : (points[s * 2 + 3] ?? ay);

    const left = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
    const right = Math.min(width - 1, Math.ceil(Math.max(ax, bx) + reach));
    const top = Math.max(0, Math.floor(Math.min(ay, by) - reach));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(ay, by) + reach));
    if (left > right || top > bottom) continue;

    if (left < touchedLeft) touchedLeft = left;
    if (top < touchedTop) touchedTop = top;
    if (right > touchedRight) touchedRight = right;
    if (bottom > touchedBottom) touchedBottom = bottom;

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const distance = segmentDistance(x + 0.5, y + 0.5, ax, ay, bx, by);
        const coverage = Math.min(1, Math.max(0, radius + 0.5 - distance));
        if (coverage === 0) continue;
        const index = y * width + x;
        const scaled = Math.round(coverage * 255);
        if (scaled > (mask[index] ?? 0)) mask[index] = scaled;
      }
    }
  }

  if (touchedRight < 0) return;
  for (let y = touchedTop; y <= touchedBottom; y++) {
    for (let x = touchedLeft; x <= touchedRight; x++) {
      const index = y * width + x;
      const coverage = mask[index] ?? 0;
      if (coverage === 0) continue;
      blend(canvas, index, rgb, (coverage / 255) * alpha);
      // Reset as we go: the next stroke reuses the same buffer.
      mask[index] = 0;
    }
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Minimal 8-bit truecolour PNG: every scanline filtered as `None`. */
function encodePng(canvas: Canvas): Buffer {
  const { width, height, rgb } = canvas;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Pixel budget: past this, rasterizing is slower than the request is worth and
 * the caller is better off sending a render it already has. Generous enough
 * that no hand-authored drawing reaches it.
 */
const MAX_PIXEL_WORK = 120_000_000;

function estimateWork(drawing: DrawingData): number {
  let work = drawing.width * drawing.height;
  for (const stroke of drawing.strokes) {
    const span = Math.ceil(stroke.size) + 2;
    work += Math.max(1, (stroke.points.length - 2) / 2) * span * span;
  }
  return work;
}

/** Rasterize a drawing's vectors to a PNG the attachment routes accept. */
export function renderDrawingPng(drawing: DrawingData): Buffer {
  if (estimateWork(drawing) > MAX_PIXEL_WORK) {
    throw new Error(
      'This drawing is too large to rasterize here — pass the PNG render as png_base64 (or path) instead.',
    );
  }
  const canvas = paper(drawing.width, drawing.height);
  drawGrid(canvas, drawing.background);
  const mask = new Uint8Array(drawing.width * drawing.height);
  for (const stroke of drawing.strokes) drawStroke(canvas, mask, stroke);
  return encodePng(canvas);
}
