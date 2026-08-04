import type { DrawingTool } from '../schemas/attachments.js';

/**
 * How opaque each tool paints. Shared rather than owned by the canvas code
 * because a drawing is rendered twice from the same vectors — by the browser
 * editor and, for drawings an agent composes, by the MCP rasterizer — and the
 * two have to agree or the same strokes come out looking different.
 */
export const TOOL_ALPHA: Record<DrawingTool, number> = { pen: 1, marker: 1, highlighter: 0.45 };

/** Keep's paper patterns, in the units both renderers step by. */
export const DRAWING_GRID = {
  /** `rules` is ruled wider than the squared and dotted papers. */
  stepRules: 32,
  step: 24,
  lineColor: 'rgba(0, 0, 0, 0.12)',
  dotColor: 'rgba(0, 0, 0, 0.18)',
  dotRadius: 1.2,
} as const;

/** The paper itself: white, and opaque — a drawing is never transparent. */
export const DRAWING_PAPER = '#ffffff';
