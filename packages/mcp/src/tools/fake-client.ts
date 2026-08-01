import { randomUUID } from 'node:crypto';
import type {
  Attachment,
  Collaborator,
  FullNote,
  InviteRole,
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
} from '@openkeep/shared';
import { htmlToPlainText, plainTextToHtml, positionAfter } from '@openkeep/shared';
import { OpenKeepApiError } from '../client/errors.js';
import type {
  CreateItemInput,
  CreateNoteInput,
  Job,
  NoteView,
  OpenKeepClient,
  SearchQuery,
  SearchResult,
} from '../client/types.js';

function apiError(status: number, code: string, detail?: string): OpenKeepApiError {
  return new OpenKeepApiError({ type: 'about:blank', title: code, status, code, detail });
}

const DEFAULT_SETTINGS: UserSettings = {
  addItemsToBottom: true,
  moveCheckedToBottom: true,
  richLinkPreviews: true,
  sharingEnabled: true,
  reminderMorning: '08:00',
  reminderAfternoon: '13:00',
  reminderEvening: '18:00',
  timezone: null,
  noteSort: 'manual',
  viewMode: 'grid',
  savedSearches: [],
};

/**
 * In-memory OpenKeepClient for unit tests: Map-backed, mirrors the REST
 * semantics the tools rely on (404 without oracle, note_trashed guard,
 * label_exists conflict, items ordered by insertion).
 */
export class FakeOpenKeepClient implements OpenKeepClient {
  notes = new Map<string, FullNote>();
  labels = new Map<string, Label>();
  attachmentData = new Map<string, { data: Uint8Array; mime: string }>();
  jobs = new Map<string, Job>();
  versions = new Map<string, { meta: NoteVersionMeta; content: string }[]>();
  settings: UserSettings = { ...DEFAULT_SETTINGS };
  exportZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  /** Ordered log of mutating calls — lets tests assert composite sequencing. */
  calls: string[] = [];

  private note(id: string): FullNote {
    const note = this.notes.get(id);
    if (!note) throw apiError(404, 'not_found');
    return note;
  }

  private editable(id: string): FullNote {
    const note = this.note(id);
    if (note.trashedAt !== null)
      throw apiError(409, 'note_trashed', 'Restore the note to edit it.');
    return note;
  }

  private touch(note: FullNote): void {
    note.updatedAt = new Date().toISOString();
  }

  seedNote(partial: Partial<FullNote> & { id?: string }): FullNote {
    const id = partial.id ?? randomUUID();
    const note: FullNote = {
      id,
      type: 'text',
      title: '',
      bodyHtml: '',
      hasLinks: false,
      items: [],
      labelIds: [],
      attachments: [],
      reminder: null,
      collaborators: [{ userId: 'me', email: 'me@example.com', name: 'Me', role: 'owner' }],
      role: 'owner',
      pinned: false,
      archived: false,
      color: 'default',
      background: 'none',
      position: `a${this.notes.size}`,
      trashedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...partial,
    };
    this.notes.set(id, note);
    return note;
  }

  // ---------------------------------------------------------------- notes

  async listNotes(query?: { view?: NoteView; label?: string }): Promise<FullNote[]> {
    const view = query?.view ?? 'active';
    let notes = [...this.notes.values()].filter((n) => {
      const trashed = n.trashedAt !== null;
      if (view === 'trash') return trashed;
      if (view === 'archived') return !trashed && n.archived;
      return !trashed && !n.archived;
    });
    if (query?.label) {
      const label = [...this.labels.values()].find(
        (l) => l.name.toLowerCase() === query.label?.toLowerCase(),
      );
      notes = label ? notes.filter((n) => n.labelIds.includes(label.id)) : [];
    }
    return notes;
  }

  async getNote(id: string): Promise<FullNote> {
    return this.note(id);
  }

  async createNote(input: CreateNoteInput): Promise<FullNote> {
    this.calls.push('createNote');
    return this.seedNote({
      type: input.type ?? 'text',
      title: input.title ?? '',
      bodyHtml: input.bodyHtml ?? '',
      pinned: input.pinned ?? false,
      color: input.color ?? 'default',
      background: input.background ?? 'none',
      items: (input.items ?? []).map((item, i) => ({
        id: randomUUID(),
        text: item.text,
        checked: item.checked ?? false,
        indent: item.indent ?? 0,
        position: `a${i}`,
      })),
    });
  }

  async patchNoteContent(id: string, patch: PatchNoteContent): Promise<NoteContentResult> {
    this.calls.push('patchNoteContent');
    const note = this.editable(id);
    if (patch.title !== undefined) note.title = patch.title;
    if (patch.bodyHtml !== undefined) {
      note.bodyHtml = patch.bodyHtml;
      note.hasLinks = /https?:\/\//.test(patch.bodyHtml);
    }
    this.touch(note);
    return {
      id,
      title: note.title,
      bodyHtml: note.bodyHtml,
      hasLinks: note.hasLinks,
      updatedAt: note.updatedAt,
    };
  }

  async patchNoteState(id: string, patch: PatchNoteState): Promise<NoteStateResult> {
    this.calls.push('patchNoteState');
    const note = this.editable(id);
    Object.assign(note, patch);
    return {
      id,
      pinned: note.pinned,
      archived: note.archived,
      color: note.color,
      background: note.background,
      position: note.position,
    };
  }

  async trashNote(id: string): Promise<FullNote> {
    this.calls.push('trashNote');
    const note = this.note(id);
    note.trashedAt = new Date().toISOString();
    note.pinned = false;
    return note;
  }

  async restoreNote(id: string): Promise<FullNote> {
    this.calls.push('restoreNote');
    const note = this.note(id);
    note.trashedAt = null;
    return note;
  }

  async deleteNoteForever(id: string): Promise<void> {
    const note = this.note(id);
    if (note.trashedAt === null) {
      throw apiError(409, 'conflict', 'Only trashed notes can be deleted forever');
    }
    this.notes.delete(id);
  }

  async emptyTrash(): Promise<{ deleted: number }> {
    let deleted = 0;
    for (const [id, note] of this.notes) {
      if (note.trashedAt !== null) {
        this.notes.delete(id);
        deleted++;
      }
    }
    return { deleted };
  }

  async copyNote(id: string): Promise<FullNote> {
    const source = this.editable(id);
    return this.seedNote({
      type: source.type,
      title: source.title,
      bodyHtml: source.bodyHtml,
      items: source.items.map((i) => ({ ...i, id: randomUUID() })),
      labelIds: [...source.labelIds],
      color: source.color,
      background: source.background,
    });
  }

  async convertNote(id: string, to: 'text' | 'list'): Promise<FullNote> {
    const note = this.editable(id);
    if (note.type === to) return note;
    if (to === 'list') {
      const lines = htmlToPlainText(note.bodyHtml)
        .split('\n')
        .filter((l) => l.trim() !== '');
      note.items = lines.map((text, i) => ({
        id: randomUUID(),
        text,
        checked: false,
        indent: 0,
        position: `a${i}`,
      }));
      note.bodyHtml = '';
      note.type = 'list';
    } else {
      note.bodyHtml = plainTextToHtml(note.items.map((i) => i.text).join('\n'));
      note.items = [];
      note.type = 'text';
    }
    return note;
  }

  // ---------------------------------------------------------------- versions

  async listVersions(noteId: string): Promise<NoteVersionMeta[]> {
    this.note(noteId);
    return (this.versions.get(noteId) ?? []).map((v) => v.meta);
  }

  async downloadVersion(
    noteId: string,
    versionId: string,
  ): Promise<{ filename: string; content: string }> {
    const version = (this.versions.get(noteId) ?? []).find((v) => v.meta.id === versionId);
    if (!version) throw apiError(404, 'not_found');
    return { filename: 'note.txt', content: version.content };
  }

  async restoreVersion(noteId: string, versionId: string): Promise<FullNote> {
    const version = (this.versions.get(noteId) ?? []).find((v) => v.meta.id === versionId);
    if (!version) throw apiError(404, 'not_found');
    const note = this.editable(noteId);
    note.bodyHtml = plainTextToHtml(version.content);
    return note;
  }

  // ---------------------------------------------------------------- items

  async createItem(noteId: string, input: CreateItemInput): Promise<NoteItem> {
    this.calls.push(`createItem:${input.text ?? ''}`);
    const note = this.editable(noteId);
    const item: NoteItem = {
      id: randomUUID(),
      text: input.text ?? '',
      checked: input.checked ?? false,
      indent: input.indent ?? 0,
      position: `a${note.items.length}`,
    };
    note.items.push(item);
    return item;
  }

  async patchItem(
    noteId: string,
    itemId: string,
    patch: { text?: string; checked?: boolean; indent?: 0 | 1; position?: string },
  ): Promise<ItemPatchResult> {
    const note = this.editable(noteId);
    const item = note.items.find((i) => i.id === itemId);
    if (!item) throw apiError(404, 'not_found');
    Object.assign(item, patch);
    return { item, cascaded: [] };
  }

  async deleteItem(noteId: string, itemId: string): Promise<void> {
    const note = this.editable(noteId);
    note.items = note.items.filter((i) => i.id !== itemId);
  }

  async uncheckAll(noteId: string): Promise<ItemsReplacedResult> {
    const note = this.editable(noteId);
    for (const item of note.items) item.checked = false;
    return { noteId, items: note.items };
  }

  async deleteChecked(noteId: string): Promise<ItemsReplacedResult> {
    const note = this.editable(noteId);
    note.items = note.items.filter((i) => !i.checked);
    return { noteId, items: note.items };
  }

  // ---------------------------------------------------------------- labels

  async listLabels(): Promise<Label[]> {
    return [...this.labels.values()].sort(
      (a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name),
    );
  }

  async createLabel(name: string): Promise<Label> {
    this.calls.push(`createLabel:${name}`);
    for (const l of this.labels.values()) {
      if (l.name.toLowerCase() === name.toLowerCase()) {
        throw apiError(409, 'label_exists', 'Label already exists');
      }
    }
    const label: Label = {
      id: randomUUID(),
      name,
      color: 'default',
      emoji: null,
      position: positionAfter(
        [...this.labels.values()]
          .map((l) => l.position)
          .sort()
          .at(-1) ?? null,
      ),
      createdAt: new Date().toISOString(),
    };
    this.labels.set(label.id, label);
    return label;
  }

  async renameLabel(id: string, name: string): Promise<Label> {
    const label = this.labels.get(id);
    if (!label) throw apiError(404, 'not_found');
    label.name = name;
    return label;
  }

  async deleteLabel(id: string): Promise<void> {
    if (!this.labels.delete(id)) throw apiError(404, 'not_found');
    for (const note of this.notes.values()) {
      note.labelIds = note.labelIds.filter((l) => l !== id);
    }
  }

  async addLabelToNote(noteId: string, labelId: string): Promise<void> {
    this.calls.push('addLabelToNote');
    const note = this.note(noteId);
    if (!this.labels.has(labelId)) throw apiError(404, 'not_found');
    if (!note.labelIds.includes(labelId)) note.labelIds.push(labelId);
  }

  async removeLabelFromNote(noteId: string, labelId: string): Promise<void> {
    const note = this.note(noteId);
    note.labelIds = note.labelIds.filter((l) => l !== labelId);
  }

  // ---------------------------------------------------------------- reminders

  async setReminder(noteId: string, input: SetReminder): Promise<Reminder> {
    this.calls.push(`setReminder:${input.timezone}`);
    const note = this.note(noteId);
    note.reminder = {
      remindAt: input.remindAt,
      rrule: input.rrule ?? null,
      timezone: input.timezone,
      snoozedUntil: null,
      done: false,
    };
    return note.reminder;
  }

  async deleteReminder(noteId: string): Promise<void> {
    this.note(noteId).reminder = null;
  }

  async snoozeReminder(noteId: string, until: string): Promise<Reminder> {
    const note = this.note(noteId);
    if (!note.reminder) throw apiError(404, 'not_found');
    note.reminder.snoozedUntil = until;
    return note.reminder;
  }

  async dismissReminder(noteId: string): Promise<void> {
    const note = this.note(noteId);
    if (note.reminder) note.reminder.done = true;
  }

  // ---------------------------------------------------------------- search & links

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const q = (query.q ?? '').toLowerCase();
    return [...this.notes.values()]
      .filter((n) => n.trashedAt === null)
      .filter((n) => {
        if (query.type === 'list' && n.type !== 'list') return false;
        if (query.type === 'reminder' && !n.reminder) return false;
        if (query.color && n.color !== query.color) return false;
        if (query.collaborator && !n.collaborators.some((c) => c.userId === query.collaborator))
          return false;
        return (
          q === '' ||
          n.title.toLowerCase().includes(q) ||
          htmlToPlainText(n.bodyHtml).toLowerCase().includes(q) ||
          n.items.some((i) => i.text.toLowerCase().includes(q))
        );
      })
      .map((n) => ({ ...n, headline: q ? `…<b>${q}</b>…` : null }));
  }

  async getLinkPreview(url: string): Promise<LinkPreview> {
    return {
      url,
      status: 'ok',
      title: 'Example',
      description: null,
      siteName: null,
      faviconUrl: null,
      imageUrl: null,
    };
  }

  // ---------------------------------------------------------------- settings

  async getSettings(): Promise<UserSettings> {
    return { ...this.settings };
  }

  async updateSettings(patch: UserSettingsPatch): Promise<UserSettings> {
    this.settings = { ...this.settings, ...patch };
    return { ...this.settings };
  }

  // ---------------------------------------------------------------- collaborators

  async listCollaborators(noteId: string): Promise<Collaborator[]> {
    return this.note(noteId).collaborators;
  }

  async addCollaborator(
    noteId: string,
    email: string,
    role: InviteRole = 'collaborator',
  ): Promise<Collaborator> {
    const note = this.note(noteId);
    const collaborator: Collaborator = {
      userId: randomUUID(),
      email,
      name: email.split('@')[0] ?? email,
      role,
    };
    note.collaborators.push(collaborator);
    return collaborator;
  }

  async setCollaboratorRole(
    noteId: string,
    userId: string,
    role: InviteRole,
  ): Promise<Collaborator> {
    const note = this.note(noteId);
    const collaborator = note.collaborators.find((c) => c.userId === userId);
    if (!collaborator) throw new Error('Collaborator not found');
    collaborator.role = role;
    return collaborator;
  }

  async removeCollaborator(noteId: string, userId: string): Promise<void> {
    const note = this.note(noteId);
    note.collaborators = note.collaborators.filter((c) => c.userId !== userId);
  }

  // ---------------------------------------------------------------- attachments

  async uploadImage(noteId: string, data: Uint8Array, _filename?: string): Promise<Attachment> {
    const note = this.editable(noteId);
    const attachment: Attachment = {
      id: randomUUID(),
      kind: 'image',
      mime: 'image/png',
      width: 1,
      height: 1,
      filename: null,
      hasThumb: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    note.attachments.push(attachment);
    this.attachmentData.set(attachment.id, { data, mime: 'image/png' });
    return attachment;
  }

  async downloadAttachment(
    id: string,
    _variant: 'file' | 'thumb',
  ): Promise<{ data: Uint8Array; mime: string }> {
    const stored = this.attachmentData.get(id);
    if (!stored) throw apiError(404, 'not_found');
    return stored;
  }

  async deleteAttachment(id: string): Promise<void> {
    if (!this.attachmentData.delete(id)) throw apiError(404, 'not_found');
    for (const note of this.notes.values()) {
      note.attachments = note.attachments.filter((a) => a.id !== id);
    }
  }

  // ---------------------------------------------------------------- import/export

  async startExport(): Promise<{ jobId: string }> {
    const job: Job = {
      id: randomUUID(),
      kind: 'export',
      status: 'done',
      progress: 1,
      total: 1,
      error: null,
      summary: null,
      downloadReady: true,
    };
    this.jobs.set(job.id, job);
    return { jobId: job.id };
  }

  async importTakeout(_zip: Uint8Array, _filename?: string): Promise<{ jobId: string }> {
    const job: Job = {
      id: randomUUID(),
      kind: 'import',
      status: 'running',
      progress: 0,
      total: 3,
      error: null,
      summary: null,
      downloadReady: false,
    };
    this.jobs.set(job.id, job);
    return { jobId: job.id };
  }

  async getJob(id: string): Promise<Job> {
    const job = this.jobs.get(id);
    if (!job) throw apiError(404, 'not_found');
    return job;
  }

  async downloadExport(jobId: string): Promise<Uint8Array> {
    await this.getJob(jobId);
    return this.exportZip;
  }
}
