import { z } from 'zod';
import type { Attachment } from './attachments.js';
import type { Label } from './labels.js';
import type { FullNote, NoteContentResult, NoteItem, NoteStateResult } from './notes.js';
import type { Reminder } from './reminders.js';
import type { UserSettings } from './settings.js';

export const zCollaborator = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'collaborator']),
});
export type Collaborator = z.infer<typeof zCollaborator>;

/** WS envelope. `origin` echoes the mutation's X-Client-Id so tabs drop their own echoes. */
export interface WsEnvelope<T extends WsEvent = WsEvent> {
  type: T['type'];
  ts: string;
  origin?: string | undefined;
  payload: T['payload'];
}

export type WsEvent =
  | { type: 'note.added'; payload: { note: FullNote } }
  | { type: 'note.updated'; payload: NoteContentResult }
  | { type: 'note.trashed'; payload: { id: string; trashedAt: string } }
  | { type: 'note.restored'; payload: { id: string } }
  | { type: 'note.removed'; payload: { id: string; reason: 'deleted' | 'unshared' | 'left' } }
  | { type: 'note.state_changed'; payload: NoteStateResult }
  | { type: 'note.labels_changed'; payload: { id: string; labelIds: string[] } }
  | { type: 'note.converted'; payload: { note: FullNote } }
  | { type: 'item.added'; payload: { noteId: string; item: NoteItem } }
  | { type: 'item.updated'; payload: { noteId: string; item: NoteItem; cascaded: NoteItem[] } }
  | { type: 'item.removed'; payload: { noteId: string; itemId: string } }
  | { type: 'items.replaced'; payload: { noteId: string; items: NoteItem[] } }
  | { type: 'label.created'; payload: { label: Label } }
  | { type: 'label.renamed'; payload: { label: Label } }
  | { type: 'label.deleted'; payload: { labelId: string } }
  | { type: 'reminder.set'; payload: { noteId: string; reminder: Reminder } }
  | { type: 'reminder.deleted'; payload: { noteId: string } }
  | { type: 'reminder.fired'; payload: { noteId: string; title: string; remindAt: string } }
  | { type: 'reminder.dismissed'; payload: { noteId: string } }
  | { type: 'attachment.added'; payload: { noteId: string; attachment: Attachment } }
  | { type: 'attachment.updated'; payload: { noteId: string; attachment: Attachment } }
  | { type: 'attachment.removed'; payload: { noteId: string; attachmentId: string } }
  | { type: 'collaborator.added'; payload: { noteId: string; collaborator: Collaborator } }
  | { type: 'collaborator.removed'; payload: { noteId: string; userId: string } }
  | { type: 'settings.updated'; payload: Partial<UserSettings> }
  | { type: 'job.progress'; payload: { jobId: string; progress: number; total: number } }
  | { type: 'job.completed'; payload: { jobId: string; kind: 'import' | 'export' } }
  | { type: 'job.failed'; payload: { jobId: string; kind: 'import' | 'export' } }
  | { type: 'link_preview.resolved'; payload: { url: string } };

export type WsEventType = WsEvent['type'];
