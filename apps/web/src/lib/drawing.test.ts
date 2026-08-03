import type { DrawingStroke } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import {
  createStrokeModeler,
  DRAWING_COLORS,
  DRAWING_SIZES,
  inkBounds,
  pointInPolygon,
  strokeHitsPoint,
  strokesInPolygon,
  translateStroke,
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

// A 100×100 loop around the origin corner.
const square = [0, 0, 100, 0, 100, 100, 0, 100];

describe('lasso selection', () => {
  it('point-in-polygon ignores what the loop only passes by', () => {
    expect(pointInPolygon(square, 50, 50)).toBe(true);
    expect(pointInPolygon(square, 150, 50)).toBe(false);
  });

  it('takes a stroke only when the loop encloses all of it', () => {
    const inside = stroke([10, 10, 90, 90]);
    const halfIn = stroke([90, 90, 190, 90]);
    const outside = stroke([300, 300, 320, 320]);
    expect(strokesInPolygon([inside, halfIn, outside], square)).toEqual([inside]);
  });

  it('a lasso needs three points to enclose anything', () => {
    expect(strokesInPolygon([stroke([10, 10, 20, 20])], [0, 0, 100, 100])).toEqual([]);
  });

  it('translating a stroke moves every point and is exactly reversible', () => {
    const s = stroke([10, 20, 30, 40]);
    translateStroke(s, 5, -5);
    expect(s.points).toEqual([15, 15, 35, 35]);
    translateStroke(s, -5, 5);
    expect(s.points).toEqual([10, 20, 30, 40]);
  });
});
