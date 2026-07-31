import type { FullNote } from '@openkeep/shared';

/**
 * The client-side half of the server's access levels (modules/notes/access.ts).
 * Nothing here is a security boundary — every call still hits the chokepoint —
 * but a button that can only ever 403 should not be on screen.
 */

/** Shared with me for viewing only. */
export function isViewer(note: Pick<FullNote, 'role'>): boolean {
  return note.role === 'viewer';
}

/**
 * May I write the SHARED content: title, body, checklist items, attachments,
 * note type, version restore?
 *
 * Per-user state — pin, color, background, labels, reminder, board position —
 * is mine on any note I am a member of, and is deliberately NOT gated here:
 * a viewer organizes their own board like anyone else.
 */
export function canEditContent(note: Pick<FullNote, 'role' | 'trashedAt'>): boolean {
  return note.trashedAt === null && note.role !== 'viewer';
}
