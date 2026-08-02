import type { FullNote, WsEvent } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import { signPayload, verifySignature } from './delivery.js';
import { toWebhookEvent } from './events.js';

const note = { id: '018f0000-0000-7000-8000-000000000001' } as FullNote;

describe('toWebhookEvent', () => {
  it('folds every content event into one "the note changed"', () => {
    const contentEvents: WsEvent[] = [
      { type: 'note.updated', payload: { id: note.id } as never },
      { type: 'item.added', payload: { noteId: note.id } as never },
      { type: 'items.replaced', payload: { noteId: note.id } as never },
      { type: 'attachment.removed', payload: { noteId: note.id } as never },
    ];
    for (const event of contentEvents) {
      expect(toWebhookEvent(event)).toEqual({ event: 'note.updated', noteId: note.id });
    }
  });

  it('treats per-user state, labels and reminders as one state change', () => {
    expect(
      toWebhookEvent({ type: 'note.labels_changed', payload: { id: note.id } as never }),
    ).toEqual({ event: 'note.state_changed', noteId: note.id });
    expect(toWebhookEvent({ type: 'reminder.set', payload: { noteId: note.id } as never })).toEqual(
      {
        event: 'note.state_changed',
        noteId: note.id,
      },
    );
  });

  it('calls a deletion a deletion only when the note is really gone', () => {
    expect(
      toWebhookEvent({ type: 'note.removed', payload: { id: note.id, reason: 'deleted' } }),
    ).toEqual({ event: 'note.deleted', noteId: note.id });
    // Losing access is not a deletion — the note is alive in its owner's account.
    expect(
      toWebhookEvent({ type: 'note.removed', payload: { id: note.id, reason: 'unshared' } }),
    ).toBeNull();
    expect(
      toWebhookEvent({ type: 'note.removed', payload: { id: note.id, reason: 'left' } }),
    ).toBeNull();
  });

  it('drops everything that has no note behind it', () => {
    expect(toWebhookEvent({ type: 'settings.updated', payload: {} })).toBeNull();
    expect(
      toWebhookEvent({ type: 'job.completed', payload: { jobId: 'x', kind: 'export' } }),
    ).toBeNull();
    // Thousands of notes at once, with no per-note event by design.
    expect(toWebhookEvent({ type: 'notes.purged', payload: { deleted: 9, labels: 2 } })).toBeNull();
  });
});

describe('the signature', () => {
  const secret = 'okw_test-secret';
  const body = JSON.stringify({ hello: 'world' });

  it('covers the timestamp as well as the body, so a replay is detectable', () => {
    expect(signPayload(secret, '100', body)).not.toBe(signPayload(secret, '101', body));
  });

  it('verifies what it signed and refuses another key', () => {
    const sig = `sha256=${signPayload(secret, '100', body)}`;
    expect(verifySignature(secret, '100', body, sig)).toBe(true);
    expect(verifySignature('okw_other', '100', body, sig)).toBe(false);
    expect(verifySignature(secret, '100', `${body} `, sig)).toBe(false);
    // Length mismatch must not throw out of timingSafeEqual.
    expect(verifySignature(secret, '100', body, 'sha256=short')).toBe(false);
  });
});
