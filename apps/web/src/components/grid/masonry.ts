/**
 * Pure masonry layout: Keep's flow — items in ORDER, each placed into the
 * currently-shortest column (leftmost on ties). No DOM here (unit-tested).
 */

export const CARD_W = 240;
export const GUTTER = 16;

export interface MasonryItem {
  id: string;
  height: number;
}

export interface MasonryRect {
  x: number;
  y: number;
}

export interface MasonryLayout {
  rects: Map<string, MasonryRect>;
  containerHeight: number;
}

export function layoutMasonry(
  items: MasonryItem[],
  cols: number,
  cardW: number = CARD_W,
  gutter: number = GUTTER,
): MasonryLayout {
  const colCount = Math.max(1, cols);
  const colHeights = new Array<number>(colCount).fill(0);
  const rects = new Map<string, MasonryRect>();

  for (const item of items) {
    let col = 0;
    for (let c = 1; c < colCount; c++) {
      if (colHeights[c]! < colHeights[col]!) col = c;
    }
    rects.set(item.id, { x: col * (cardW + gutter), y: colHeights[col]! });
    colHeights[col]! += item.height + gutter;
  }

  const tallest = Math.max(0, ...colHeights);
  return { rects, containerHeight: tallest > 0 ? tallest - gutter : 0 };
}

/** Keep's column fit: floor((w + gutter) / (cardW + gutter)), min 1. */
export function columnsForWidth(
  width: number,
  cardW: number = CARD_W,
  gutter: number = GUTTER,
): number {
  return Math.max(1, Math.floor((width + gutter) / (cardW + gutter)));
}

/** Total grid width for centering. */
export function gridWidth(cols: number, cardW: number = CARD_W, gutter: number = GUTTER): number {
  return cols * cardW + (cols - 1) * gutter;
}
