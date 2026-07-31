import { describe, expect, it } from 'vitest';
import type { ChecklistRow } from './checklist-logic.js';
import {
  applyCheck,
  canIndent,
  DRAG_INDENT_PX,
  displayGroups,
  indentFromDragX,
  positionAfterRow,
  positionAtIndex,
  splitText,
} from './checklist-logic.js';

let n = 0;
const row = (over: Partial<ChecklistRow>): ChecklistRow => {
  n += 1;
  return {
    key: `k${n}`,
    id: `id${n}`,
    text: `item ${n}`,
    checked: false,
    indent: 0,
    position: `a${String(n).padStart(3, '0')}`,
    ...over,
  };
};

describe('checklist logic', () => {
  it('splits text at the caret', () => {
    expect(splitText('milk and eggs', 4)).toEqual(['milk', ' and eggs']);
    expect(splitText('abc', 0)).toEqual(['', 'abc']);
    expect(splitText('abc', 3)).toEqual(['abc', '']);
  });

  it('never allows indenting the first item', () => {
    const rows = [row({}), row({})];
    expect(canIndent(rows, rows[0]!.key)).toBe(false);
    expect(canIndent(rows, rows[1]!.key)).toBe(true);
  });

  it('reads horizontal drag travel as indent, and small travel as nothing', () => {
    expect(indentFromDragX(DRAG_INDENT_PX, 0)).toBe(1);
    expect(indentFromDragX(-DRAG_INDENT_PX, 1)).toBe(0);
    // Below the threshold the gesture is a plain reorder, in either direction.
    expect(indentFromDragX(DRAG_INDENT_PX - 1, 0)).toBeNull();
    expect(indentFromDragX(1 - DRAG_INDENT_PX, 1)).toBeNull();
    // Already at the level the gesture asks for: nothing to write.
    expect(indentFromDragX(DRAG_INDENT_PX * 4, 1)).toBeNull();
    expect(indentFromDragX(-DRAG_INDENT_PX * 4, 0)).toBeNull();
  });

  it('computes insert positions between neighbors', () => {
    const rows = [row({ position: 'a0' }), row({ position: 'a2' })];
    const afterFirst = positionAfterRow(rows, rows[0]!.key);
    expect(afterFirst > 'a0' && afterFirst < 'a2').toBe(true);
    const atStart = positionAfterRow(rows, null);
    expect(atStart < 'a0').toBe(true);
    const atEnd = positionAfterRow(rows, rows[1]!.key);
    expect(atEnd > 'a2').toBe(true);
  });

  it('computes move-to-index positions excluding the moving row', () => {
    const rows = [row({ position: 'a0' }), row({ position: 'a1' }), row({ position: 'a2' })];
    const moved = positionAtIndex(rows, rows[2]!.key, 0);
    expect(moved < 'a0').toBe(true);
    const middle = positionAtIndex(rows, rows[0]!.key, 1);
    expect(middle > 'a1' && middle < 'a2').toBe(true);
  });

  it('cascades parent check to its indent-1 run only', () => {
    const rows = [
      row({ position: 'a0', indent: 0 }),
      row({ position: 'a1', indent: 1 }),
      row({ position: 'a2', indent: 1 }),
      row({ position: 'a3', indent: 0 }),
      row({ position: 'a4', indent: 1 }),
    ];
    const { rows: next, cascadedKeys } = applyCheck(rows, rows[0]!.key, true);
    expect(cascadedKeys.sort()).toEqual([rows[1]!.key, rows[2]!.key].sort());
    expect(next.filter((r) => r.checked)).toHaveLength(3);
    expect(next.find((r) => r.key === rows[4]!.key)?.checked).toBe(false);
  });

  it('checking a child does not cascade', () => {
    const rows = [row({ indent: 0, position: 'a0' }), row({ indent: 1, position: 'a1' })];
    const { cascadedKeys } = applyCheck(rows, rows[1]!.key, true);
    expect(cascadedKeys).toEqual([]);
  });

  it('groups checked rows below when move-to-bottom is on, inline otherwise', () => {
    const rows = [row({ position: 'a0', checked: true }), row({ position: 'a1', checked: false })];
    const grouped = displayGroups(rows, true);
    expect(grouped.unchecked.map((r) => r.position)).toEqual(['a1']);
    expect(grouped.checked.map((r) => r.position)).toEqual(['a0']);

    const inline = displayGroups(rows, false);
    expect(inline.unchecked.map((r) => r.position)).toEqual(['a0', 'a1']);
    expect(inline.checked).toEqual([]);
  });
});
