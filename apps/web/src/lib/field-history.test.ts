import { describe, expect, it } from 'vitest';
import {
  createHistory,
  type FieldHistory,
  type FieldSnapshot,
  HISTORY_LIMIT,
  type HistoryItem,
  recordStep,
  redoStep,
  undoStep,
} from './field-history.js';

const item = (key: string, text: string, over: Partial<HistoryItem> = {}): HistoryItem => ({
  key,
  text,
  checked: false,
  indent: 0,
  position: key,
  ...over,
});

const snap = (title: string, items: HistoryItem[] | null = null): FieldSnapshot => ({
  title,
  items,
});

/** Assert-and-return, so a walk over several steps reads as one. */
function step(next: FieldHistory | null): FieldHistory {
  if (next === null) throw new Error('expected a step');
  return next;
}

describe('field history', () => {
  it('coalesces typing in one field and breaks on a pause', () => {
    let h = createHistory(snap(''));
    h = recordStep(h, snap('m'), 'title', 1000);
    h = recordStep(h, snap('mi'), 'title', 1100);
    h = recordStep(h, snap('mil'), 'title', 1200);
    expect(h.past).toHaveLength(1);
    expect(h.present.title).toBe('mil');

    h = recordStep(h, snap('milk'), 'title', 3000);
    expect(h.past).toHaveLength(2);
    expect(undoStep(h, snap('milk'))?.present.title).toBe('mil');
  });

  it('breaks the group when the edit moves to another field', () => {
    let h = createHistory(snap(''));
    h = recordStep(h, snap('a'), 'title', 1000);
    h = recordStep(h, snap('a', [item('r1', 'x')]), 'item:r1', 1050);
    h = recordStep(h, snap('a', [item('r1', 'xy')]), 'item:r1', 1100);
    expect(h.past).toHaveLength(2);
  });

  it('never coalesces a structural change', () => {
    let h = createHistory(snap('', []));
    h = recordStep(h, snap('', [item('r1', '')]), null, 1000);
    h = recordStep(h, snap('', [item('r1', ''), item('r2', '')]), null, 1010);
    expect(h.past).toHaveLength(2);
  });

  it('drops a no-op re-record', () => {
    const h = createHistory(snap('milk'));
    expect(recordStep(h, snap('milk'), 'title', 1000)).toBe(h);
  });

  it('walks back and forward over the same steps', () => {
    let h = createHistory(snap('a'));
    h = recordStep(h, snap('b'), null, 1000);
    h = recordStep(h, snap('c'), null, 2000);

    h = step(undoStep(h, snap('c')));
    expect(h.present.title).toBe('b');
    h = step(undoStep(h, snap('b')));
    expect(h.present.title).toBe('a');
    expect(undoStep(h, snap('a'))).toBeNull();

    h = step(redoStep(h, snap('a')));
    expect(h.present.title).toBe('b');
    h = step(redoStep(h, snap('b')));
    expect(h.present.title).toBe('c');
    expect(redoStep(h, snap('c'))).toBeNull();
  });

  it('a new edit after an undo drops the redo stack', () => {
    let h = createHistory(snap('a'));
    h = recordStep(h, snap('b'), null, 1000);
    h = step(undoStep(h, snap('b')));
    expect(h.future).toHaveLength(1);
    h = recordStep(h, snap('z'), 'title', 2000);
    expect(h.future).toHaveLength(0);
  });

  it('redo restores what was on screen, not the step it came from', () => {
    // A collaborator retitles the note between the step and the undo: the
    // redo has to bring back what they wrote, not the pre-merge snapshot.
    let h = createHistory(snap('mine'));
    h = recordStep(h, snap('mine edited'), null, 1000);
    h = step(undoStep(h, snap('theirs')));
    expect(h.present.title).toBe('mine');
    expect(redoStep(h, snap('mine'))?.present.title).toBe('theirs');
  });

  it('the ring drops the oldest step past the limit', () => {
    let h = createHistory(snap('0'));
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++)
      h = recordStep(h, snap(String(i)), null, i * 5000);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]?.title).toBe(String(20));
  });

  it('compares items field by field', () => {
    const h = createHistory(snap('', [item('r1', 'milk'), item('r2', 'eggs')]));
    expect(recordStep(h, snap('', [item('r1', 'milk'), item('r2', 'eggs')]), null, 1)).toBe(h);
    expect(
      recordStep(h, snap('', [item('r1', 'milk'), item('r2', 'eggs', { checked: true })]), null, 1)
        .past,
    ).toHaveLength(1);
  });
});
