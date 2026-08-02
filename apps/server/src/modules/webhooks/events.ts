import type { WebhookEvent, WsEvent } from '@openkeep/shared';

/**
 * Translate one internal realtime event into the outbound vocabulary.
 *
 * This is the whole contract in one function, and it is deliberately
 * many-to-few: an attachment upload, a checklist item, a body paste and a note
 * conversion are four events to our own client and one fact — "this note
 * changed" — to an automation. Anything that has no note behind it (job
 * progress, settings, the account-wide purge) maps to null and never leaves
 * the building.
 */
export function toWebhookEvent(event: WsEvent): { event: WebhookEvent; noteId: string } | null {
  switch (event.type) {
    case 'note.added':
    case 'note.converted':
      return { event: 'note.created', noteId: event.payload.note.id };

    case 'note.updated':
      return { event: 'note.updated', noteId: event.payload.id };
    case 'item.added':
    case 'item.updated':
    case 'item.removed':
    case 'items.replaced':
    case 'attachment.added':
    case 'attachment.updated':
    case 'attachment.removed':
      return { event: 'note.updated', noteId: event.payload.noteId };

    case 'note.state_changed':
    case 'note.labels_changed':
      return { event: 'note.state_changed', noteId: event.payload.id };
    case 'reminder.set':
    case 'reminder.deleted':
    case 'reminder.dismissed':
      return { event: 'note.state_changed', noteId: event.payload.noteId };

    case 'reminder.fired':
      return { event: 'reminder.fired', noteId: event.payload.noteId };

    case 'note.trashed':
      return { event: 'note.trashed', noteId: event.payload.id };
    case 'note.restored':
      return { event: 'note.restored', noteId: event.payload.id };
    /**
     * Only a real deletion. `unshared` and `left` also take the note off
     * somebody's board, but "the note was deleted" would be a lie about a note
     * that is alive and well in its owner's account.
     */
    case 'note.removed':
      return event.payload.reason === 'deleted'
        ? { event: 'note.deleted', noteId: event.payload.id }
        : null;

    default:
      return null;
  }
}
