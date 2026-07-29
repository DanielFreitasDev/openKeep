import type { FullNote } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import { estimateNoteHeight } from './estimate.js';

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
    reminder: null,
    collaborators: [],
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

describe('estimateNoteHeight', () => {
  it('gives an empty note the placeholder height', () => {
    const h = estimateNoteHeight(note({}), 240);
    expect(h).toBeGreaterThan(100);
    expect(h).toBeLessThan(140);
  });

  it('grows with the amount of body text', () => {
    const short = estimateNoteHeight(note({ bodyHtml: '<p>hi</p>' }), 240);
    const long = estimateNoteHeight(note({ bodyHtml: `<p>${'word '.repeat(60)}</p>` }), 240);
    expect(long).toBeGreaterThan(short + 100);
  });

  it('counts each block as at least one line', () => {
    const fourBlocks = estimateNoteHeight(
      note({ bodyHtml: '<p>a</p><p>b</p><p>c</p><p>d</p>' }),
      240,
    );
    const sixBlocks = estimateNoteHeight(
      note({ bodyHtml: '<p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p>' }),
      240,
    );
    expect(sixBlocks).toBe(fourBlocks + 40);
  });

  it('caps the body at the card max-height', () => {
    const huge = estimateNoteHeight(note({ bodyHtml: `<p>${'x'.repeat(200_000)}</p>` }), 240);
    expect(huge).toBeLessThan(600);
  });

  it('is wider-card aware: the same text needs fewer lines', () => {
    const text = note({ bodyHtml: `<p>${'word '.repeat(40)}</p>` });
    expect(estimateNoteHeight(text, 600)).toBeLessThan(estimateNoteHeight(text, 240));
  });

  it('adds a row per shown checklist item and stops at the preview cap', () => {
    const item = (i: number, checked = false) => ({
      id: `i${i}`,
      text: 'todo',
      checked,
      indent: 0 as const,
      position: `a${i}`,
    });
    const three = estimateNoteHeight(
      note({ type: 'list', items: [item(1), item(2), item(3)] }),
      240,
    );
    const twenty = estimateNoteHeight(
      note({ type: 'list', items: Array.from({ length: 20 }, (_, i) => item(i)) }),
      240,
    );
    // 8 shown + the "…" row, not 20.
    expect(twenty).toBeLessThan(three + 8 * 22);
  });

  it('reserves space for images from their aspect ratio', () => {
    const body = '<p>note with a picture</p>';
    const withImage = estimateNoteHeight(
      note({
        bodyHtml: body,
        attachments: [
          {
            id: 'a1',
            kind: 'image',
            mime: 'image/png',
            width: 200,
            height: 100,
            hasThumb: true,
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
      240,
    );
    const without = estimateNoteHeight(note({ bodyHtml: body }), 240);
    // 240px wide at 2:1 → 120px of image.
    expect(withImage - without).toBe(120);
  });

  it('accounts for the chip strips', () => {
    const plain = estimateNoteHeight(note({ title: 'x' }), 240);
    const chipped = estimateNoteHeight(note({ title: 'x', labelIds: ['l1'] }), 240);
    expect(chipped).toBeGreaterThan(plain);
  });
});
