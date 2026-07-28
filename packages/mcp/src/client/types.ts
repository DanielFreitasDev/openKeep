import type {
  Attachment,
  Collaborator,
  FullNote,
  ItemPatchResult,
  ItemsReplacedResult,
  Label,
  LinkPreview,
  NoteContentResult,
  NoteItem,
  NoteStateResult,
  NoteVersionMeta,
  PatchNoteContent,
  PatchNoteState,
  Reminder,
  SetReminder,
  UserSettings,
  UserSettingsPatch,
  zCreateItemInput,
  zCreateNote,
} from '@openkeep/shared';
import type { z } from 'zod';

/** Create payloads before Zod defaults are applied (all fields optional). */
export type CreateNoteInput = z.input<typeof zCreateNote>;
export type CreateItemInput = z.input<typeof zCreateItemInput>;

export type NoteView = 'active' | 'archived' | 'trash';
export type SearchType = 'list' | 'url' | 'image' | 'audio' | 'drawing' | 'reminder';

export interface SearchQuery {
  q?: string;
  type?: SearchType;
  label?: string;
  color?: string;
}

export type SearchResult = FullNote & { headline: string | null };

/** Wire shape of GET /api/jobs/:id (defined inline in the server routes). */
export interface Job {
  id: string;
  kind: 'import' | 'export';
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  total: number;
  error: string | null;
  summary: string | null;
  downloadReady: boolean;
}

/**
 * The complete OpenKeep REST surface the MCP tools are written against.
 * Implementations NEVER touch the database — stdio talks HTTP with a PAT,
 * the mounted /api/mcp endpoint goes through `app.inject` — so validation,
 * sanitization, authorization (404, no oracle), versioning and the realtime
 * fan-out all apply identically to AI mutations.
 */
export interface OpenKeepClient {
  // notes
  listNotes(query?: { view?: NoteView; label?: string }): Promise<FullNote[]>;
  getNote(id: string): Promise<FullNote>;
  createNote(input: CreateNoteInput): Promise<FullNote>;
  patchNoteContent(id: string, patch: PatchNoteContent): Promise<NoteContentResult>;
  patchNoteState(id: string, patch: PatchNoteState): Promise<NoteStateResult>;
  trashNote(id: string): Promise<FullNote>;
  restoreNote(id: string): Promise<FullNote>;
  deleteNoteForever(id: string): Promise<void>;
  emptyTrash(): Promise<{ deleted: number }>;
  copyNote(id: string): Promise<FullNote>;
  convertNote(id: string, to: 'text' | 'list'): Promise<FullNote>;

  // versions
  listVersions(noteId: string): Promise<NoteVersionMeta[]>;
  downloadVersion(
    noteId: string,
    versionId: string,
  ): Promise<{ filename: string; content: string }>;
  restoreVersion(noteId: string, versionId: string): Promise<FullNote>;

  // checklist items
  createItem(noteId: string, input: CreateItemInput): Promise<NoteItem>;
  patchItem(
    noteId: string,
    itemId: string,
    patch: { text?: string; checked?: boolean; indent?: 0 | 1; position?: string },
  ): Promise<ItemPatchResult>;
  deleteItem(noteId: string, itemId: string): Promise<void>;
  uncheckAll(noteId: string): Promise<ItemsReplacedResult>;
  deleteChecked(noteId: string): Promise<ItemsReplacedResult>;

  // labels
  listLabels(): Promise<Label[]>;
  createLabel(name: string): Promise<Label>;
  renameLabel(id: string, name: string): Promise<Label>;
  deleteLabel(id: string): Promise<void>;
  addLabelToNote(noteId: string, labelId: string): Promise<void>;
  removeLabelFromNote(noteId: string, labelId: string): Promise<void>;

  // reminders
  setReminder(noteId: string, input: SetReminder): Promise<Reminder>;
  deleteReminder(noteId: string): Promise<void>;
  snoozeReminder(noteId: string, until: string): Promise<Reminder>;
  dismissReminder(noteId: string): Promise<void>;

  // search & links
  search(query: SearchQuery): Promise<SearchResult[]>;
  getLinkPreview(url: string): Promise<LinkPreview>;

  // settings
  getSettings(): Promise<UserSettings>;
  updateSettings(patch: UserSettingsPatch): Promise<UserSettings>;

  // collaborators
  listCollaborators(noteId: string): Promise<Collaborator[]>;
  addCollaborator(noteId: string, email: string): Promise<Collaborator>;
  removeCollaborator(noteId: string, userId: string): Promise<void>;

  // attachments (binary payloads as Uint8Array)
  uploadImage(noteId: string, data: Uint8Array, filename?: string): Promise<Attachment>;
  downloadAttachment(
    id: string,
    variant: 'file' | 'thumb',
  ): Promise<{ data: Uint8Array; mime: string }>;
  deleteAttachment(id: string): Promise<void>;

  // import/export
  startExport(): Promise<{ jobId: string }>;
  importTakeout(zip: Uint8Array, filename?: string): Promise<{ jobId: string }>;
  getJob(id: string): Promise<Job>;
  downloadExport(jobId: string): Promise<Uint8Array>;
}
