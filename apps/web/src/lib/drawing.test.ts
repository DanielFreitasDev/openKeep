import type { DrawingStroke } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import {
  createStrokeModeler,
  DRAWING_COLORS,
  DRAWING_SIZES,
  inkBounds,
  strokeHitsPoint,
} from './drawing.js';

const stroke = (points: number[], size = 4): DrawingStroke => ({
  tool: 'pen',
  color: '#000000',
  size,
  points,
});

describe('drawing engine', () => {
  it('inkBounds covers points expanded by half the stroke width', () => {
    expect(inkBounds([stroke([10, 20, 110, 220], 8)])).toEqual({
      left: 6,
      top: 16,
      right: 114,
      bottom: 224,
    });
  });

  it('inkBounds is null for an empty page', () => {
    expect(inkBounds([])).toBeNull();
  });

  it('the eraser hit-test hits along segments, not only at vertices', () => {
    const s = stroke([0, 0, 100, 0], 4);
    expect(strokeHitsPoint(s, 50, 3, 2)).toBe(true);
    expect(strokeHitsPoint(s, 50, 20, 2)).toBe(false);
  });

  it('single-point strokes (dots) are hit-testable', () => {
    const dot = stroke([30, 30], 10);
    expect(strokeHitsPoint(dot, 33, 33, 1)).toBe(true);
    expect(strokeHitsPoint(dot, 45, 45, 1)).toBe(false);
  });

  it('the stroke modeler starts on the raw point and chases later ones', () => {
    const m = createStrokeModeler();
    expect(m.next(10, 10)).toEqual([10, 10]);
    const [x, y] = m.next(20, 10);
    expect(x).toBeGreaterThan(10);
    expect(x).toBeLessThan(20);
    expect(y).toBe(10);
  });

  it('palette and sizes mirror Keep (28 swatches, 8 dots)', () => {
    expect(DRAWING_COLORS).toHaveLength(28);
    expect(new Set(DRAWING_COLORS).size).toBe(28);
    expect(DRAWING_SIZES).toHaveLength(8);
  });
});
