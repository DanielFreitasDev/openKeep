import type { FullNote } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import {
  mergeNote,
  removeNote,
  selectArchived,
  selectMain,
  selectTrashed,
  upsertNote,
} from './note-selectors.js';

let seq = 0;
function note(over: Partial<FullNote>): FullNote {
  seq += 1;
  return {
    id: `01890000-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    type: 'text',
    title: '',
    bodyHtml: '',
    hasLinks: false,
    items: [],
    labelIds: [],
    attachments: [],
    role: 'owner',
    pinned: false,
    archived: false,
    color: 'default',
    background: 'none',
    position: `a${seq}`,
    trashedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...over,
  };
}

describe('note selectors', () => {
  it('splits main view into pinned/others, excluding archived and trashed', () => {
    const notes = [
      note({ title: 'a', pinned: true }),
      note({ title: 'b' }),
      note({ title: 'c', archived: true }),
      note({ title: 'd', trashedAt: '2026-07-20T00:00:00.000Z' }),
    ];
    const { pinned, others } = selectMain(notes);
    expect(pinned.map((n) => n.title)).toEqual(['a']);
    expect(others.map((n) => n.title)).toEqual(['b']);
  });

  it('sorts by fractional position with id tiebreak', () => {
    const notes = [
      note({ title: 'later', position: 'a5' }),
      note({ title: 'first', position: 'a1' }),
      note({ title: 'mid', position: 'a3' }),
    ];
    expect(selectMain(notes).others.map((n) => n.title)).toEqual(['first', 'mid', 'later']);
  });

  it('selects archive flat and trash by recency', () => {
    const notes = [
      note({ title: 'arch', archived: true }),
      note({ title: 'old-trash', trashedAt: '2026-07-01T00:00:00.000Z' }),
      note({ title: 'new-trash', trashedAt: '2026-07-25T00:00:00.000Z' }),
    ];
    expect(selectArchived(notes).map((n) => n.title)).toEqual(['arch']);
    expect(selectTrashed(notes).map((n) => n.title)).toEqual(['new-trash', 'old-trash']);
  });

  it('cache ops: upsert, merge, remove are immutable', () => {
    const a = note({ title: 'a' });
    const list = [a];
    const b = note({ title: 'b' });
    const withB = upsertNote(list, b);
    expect(withB).toHaveLength(2);
    expect(list).toHaveLength(1);

    const merged = mergeNote(withB, a.id, { title: 'a2' });
    expect(merged.find((n) => n.id === a.id)?.title).toBe('a2');
    expect(withB.find((n) => n.id === a.id)?.title).toBe('a');

    expect(removeNote(merged, a.id)).toHaveLength(1);
  });
});
