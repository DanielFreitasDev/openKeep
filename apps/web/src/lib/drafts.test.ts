// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAckedDraftFields,
  clearComposerDraft,
  clearComposerDraftIfNote,
  clearDraftItems,
  listNoteDraftIds,
  readComposerDraft,
  readNoteDraft,
  removeNoteDraft,
  saveComposerDraft,
  saveNoteDraftFields,
  saveNoteDraftItems,
} from './drafts.js';

const NOTE_ID = '01920000-0000-7000-8000-000000000001';

describe('drafts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('mirrors fields with per-field timestamps and merges patches', () => {
    saveNoteDraftFields(NOTE_ID, { title: 'a' });
    vi.setSystemTime(1_000_500);
    saveNoteDraftFields(NOTE_ID, { bodyHtml: '<p>b</p>' });

    const draft = readNoteDraft(NOTE_ID);
    expect(draft?.fields.title).toEqual({ value: 'a', at: 1_000_000 });
    expect(draft?.fields.bodyHtml).toEqual({ value: '<p>b</p>', at: 1_000_500 });
  });

  it('ignores non-content fields', () => {
    saveNoteDraftFields(NOTE_ID, { pinned: true, title: 'x' });
    expect(Object.keys(readNoteDraft(NOTE_ID)?.fields ?? {})).toEqual(['title']);
  });

  it('clears acked fields and drops the entry when empty', () => {
    saveNoteDraftFields(NOTE_ID, { title: 'a', bodyHtml: '<p>b</p>' });
    clearAckedDraftFields(NOTE_ID, { title: 'a', bodyHtml: '<p>b</p>' }, 1_000_000);
    expect(readNoteDraft(NOTE_ID)).toBeNull();
    expect(listNoteDraftIds()).toEqual([]);
  });

  it('keeps a field typed after the send with a different value', () => {
    saveNoteDraftFields(NOTE_ID, { title: 'a' });
    const sentAt = 1_000_100;
    vi.setSystemTime(1_000_200);
    saveNoteDraftFields(NOTE_ID, { title: 'ab' });

    // Ack for the older "a" arrives — "ab" is still unsaved and must survive.
    clearAckedDraftFields(NOTE_ID, { title: 'a' }, sentAt);
    expect(readNoteDraft(NOTE_ID)?.fields.title?.value).toBe('ab');

    // Ack for "ab" clears it even though the clock says it was typed later.
    clearAckedDraftFields(NOTE_ID, { title: 'ab' }, sentAt);
    expect(readNoteDraft(NOTE_ID)).toBeNull();
  });

  it('only clears fields present in the acked patch', () => {
    saveNoteDraftFields(NOTE_ID, { title: 'a', bodyHtml: '<p>b</p>' });
    clearAckedDraftFields(NOTE_ID, { title: 'a' }, 1_000_000);
    const draft = readNoteDraft(NOTE_ID);
    expect(draft?.fields.title).toBeUndefined();
    expect(draft?.fields.bodyHtml?.value).toBe('<p>b</p>');
  });

  it('stores checklist rows alongside fields and clears them independently', () => {
    const rows = [
      { id: null, key: 'k1', text: 'milk', checked: false, indent: 0 as const, position: 'a' },
    ];
    saveNoteDraftFields(NOTE_ID, { title: 'list' });
    saveNoteDraftItems(NOTE_ID, rows);
    expect(readNoteDraft(NOTE_ID)?.items?.rows).toEqual(rows);

    clearDraftItems(NOTE_ID);
    const draft = readNoteDraft(NOTE_ID);
    expect(draft?.items).toBeUndefined();
    expect(draft?.fields.title?.value).toBe('list');

    clearAckedDraftFields(NOTE_ID, { title: 'list' }, Date.now());
    expect(readNoteDraft(NOTE_ID)).toBeNull();
  });

  it('expires entries after 7 days', () => {
    saveNoteDraftFields(NOTE_ID, { title: 'old' });
    vi.setSystemTime(1_000_000 + 7 * 24 * 3600 * 1000 + 1);
    expect(readNoteDraft(NOTE_ID)).toBeNull();
  });

  it('survives malformed stored JSON', () => {
    localStorage.setItem(`openkeep:draft:note:${NOTE_ID}`, '{nope');
    expect(readNoteDraft(NOTE_ID)).toBeNull();
    expect(() => saveNoteDraftFields(NOTE_ID, { title: 'x' })).not.toThrow();
    expect(readNoteDraft(NOTE_ID)?.fields.title?.value).toBe('x');
  });

  it('round-trips the composer draft and clears it by note id', () => {
    saveComposerDraft({
      note: {
        id: NOTE_ID,
        type: 'text',
        title: 't',
        bodyHtml: '<p>x</p>',
        items: [],
        pinned: false,
        color: 'default',
        background: 'none',
      },
      labelIds: ['l1'],
      reminder: null,
      invites: [],
    });
    expect(readComposerDraft()?.note.title).toBe('t');

    clearComposerDraftIfNote('other-id');
    expect(readComposerDraft()).not.toBeNull();
    clearComposerDraftIfNote(NOTE_ID);
    expect(readComposerDraft()).toBeNull();
  });

  it('removeNoteDraft deletes everything for the note', () => {
    saveNoteDraftFields(NOTE_ID, { title: 'a' });
    saveNoteDraftItems(NOTE_ID, []);
    removeNoteDraft(NOTE_ID);
    expect(readNoteDraft(NOTE_ID)).toBeNull();
  });

  it('clearComposerDraft is a no-op without a draft', () => {
    expect(() => clearComposerDraft()).not.toThrow();
  });
});
