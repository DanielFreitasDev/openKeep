import { randomBytes } from 'node:crypto';
import type {
  Attachment,
  CalendarFeed,
  Collaborator,
  DrawingData,
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
  ProblemDetails,
  Reminder,
  SetReminder,
  ShareLink,
  StorageUsage,
  UserSettings,
  UserSettingsPatch,
} from '@openkeep/shared';
import { OpenKeepApiError } from './errors.js';
import type {
  CreateItemInput,
  CreateNoteInput,
  Job,
  MarkdownImportFile,
  NoteView,
  OpenKeepClient,
  SearchQuery,
  SearchResult,
} from './types.js';

export interface FetchClientOptions {
  /** OpenKeep origin, e.g. `https://keep.example.com` (no trailing slash needed). */
  baseUrl: string;
  /** PAT secret (`okp_…`) sent as `Authorization: Bearer`. */
  token: string;
  /** Realtime origin for WS echo suppression; defaults to `mcp-<hex>` per process. */
  clientId?: string;
  /** Test hook. */
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | undefined>;
}

/**
 * The drawing multipart, in the order the server needs it: the JSON field
 * FIRST, so busboy has it buffered by the time the file part resolves, then
 * the PNG render. Reversing these two is a 400 with no obvious cause.
 */
function drawingForm(png: Uint8Array, drawing: unknown): FormData {
  const form = new FormData();
  form.append('drawing', JSON.stringify(drawing));
  form.append('file', new Blob([png], { type: 'image/png' }), 'drawing.png');
  return form;
}

/**
 * `OpenKeepClient` over plain HTTP with a personal access token. No retries:
 * 401 is terminal (the PAT must be replaced by a human) and `rate_limited`
 * surfaces the wait so the model can decide.
 */
export class FetchClient implements OpenKeepClient {
  private readonly baseUrl: string;
  private readonly token: string;
  readonly clientId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FetchClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.clientId = opts.clientId ?? `mcp-${randomBytes(4).toString('hex')}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private url(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private headers(hasJsonBody: boolean): Record<string, string> {
    return {
      authorization: `Bearer ${this.token}`,
      'x-client-id': this.clientId,
      ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
    };
  }

  private async raw(path: string, opts: RequestOptions = {}): Promise<Response> {
    const { method = 'GET', body, form, query } = opts;
    const res = await this.fetchImpl(this.url(path, query), {
      method,
      headers: this.headers(body !== undefined),
      ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw await this.toError(res);
    return res;
  }

  private async toError(res: Response): Promise<OpenKeepApiError> {
    let problem: ProblemDetails | null = null;
    try {
      const parsed = (await res.json()) as ProblemDetails;
      if (parsed && typeof parsed.status === 'number' && typeof parsed.code === 'string') {
        problem = parsed;
      }
    } catch {
      // non-JSON error body — fall through to the synthetic problem
    }
    const retryHeader = res.headers.get('retry-after');
    const retryAfter = retryHeader ? Number(retryHeader) : undefined;
    return new OpenKeepApiError(
      problem ?? {
        type: 'about:blank',
        title: res.statusText || 'Request failed',
        status: res.status,
        code:
          res.status === 401
            ? 'unauthorized'
            : res.status === 429
              ? 'rate_limited'
              : 'internal_error',
      },
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  private async json<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const res = await this.raw(path, opts);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async binary(path: string): Promise<{ data: Uint8Array; mime: string }> {
    const res = await this.raw(path);
    return {
      data: new Uint8Array(await res.arrayBuffer()),
      mime: res.headers.get('content-type') ?? 'application/octet-stream',
    };
  }

  // ---------------------------------------------------------------- notes

  listNotes(query?: { view?: NoteView; label?: string }): Promise<FullNote[]> {
    return this.json('/api/notes', { query: { view: query?.view, label: query?.label } });
  }

  getNote(id: string): Promise<FullNote> {
    return this.json(`/api/notes/${id}`);
  }

  createNote(input: CreateNoteInput): Promise<FullNote> {
    return this.json('/api/notes', { method: 'POST', body: input });
  }

  patchNoteContent(id: string, patch: PatchNoteContent): Promise<NoteContentResult> {
    return this.json(`/api/notes/${id}`, { method: 'PATCH', body: patch });
  }

  patchNoteState(id: string, patch: PatchNoteState): Promise<NoteStateResult> {
    return this.json(`/api/notes/${id}/state`, { method: 'PATCH', body: patch });
  }

  trashNote(id: string): Promise<FullNote> {
    return this.json(`/api/notes/${id}/trash`, { method: 'POST' });
  }

  restoreNote(id: string): Promise<FullNote> {
    return this.json(`/api/notes/${id}/restore`, { method: 'POST' });
  }

  deleteNoteForever(id: string): Promise<void> {
    return this.json(`/api/notes/${id}`, { method: 'DELETE' });
  }

  emptyTrash(): Promise<{ deleted: number }> {
    return this.json('/api/notes/trash/empty', { method: 'POST' });
  }

  copyNote(id: string): Promise<FullNote> {
    return this.json(`/api/notes/${id}/copy`, { method: 'POST' });
  }

  convertNote(id: string, to: 'text' | 'list'): Promise<FullNote> {
    return this.json(`/api/notes/${id}/convert`, { method: 'POST', body: { to } });
  }

  mergeNotes(noteIds: string[]): Promise<FullNote> {
    return this.json('/api/notes/merge', { method: 'POST', body: { noteIds } });
  }

  deleteAllNotes(): Promise<{ deleted: number; left: number; labels: number }> {
    // The literal is the route's own guard against an accidental POST; the
    // tool asks the caller for it separately and only then gets this far.
    return this.json('/api/notes/delete-all', {
      method: 'POST',
      body: { confirm: 'delete-all-notes' },
    });
  }

  // ---------------------------------------------------------------- versions

  listVersions(noteId: string): Promise<NoteVersionMeta[]> {
    return this.json(`/api/notes/${noteId}/versions`);
  }

  async downloadVersion(
    noteId: string,
    versionId: string,
  ): Promise<{ filename: string; content: string }> {
    const res = await this.raw(`/api/notes/${noteId}/versions/${versionId}/download`);
    const disposition = res.headers.get('content-disposition') ?? '';
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'version.txt';
    return { filename, content: await res.text() };
  }

  restoreVersion(noteId: string, versionId: string): Promise<FullNote> {
    return this.json(`/api/notes/${noteId}/versions/${versionId}/restore`, { method: 'POST' });
  }

  // ---------------------------------------------------------------- items

  createItem(noteId: string, input: CreateItemInput): Promise<NoteItem> {
    return this.json(`/api/notes/${noteId}/items`, { method: 'POST', body: input });
  }

  patchItem(
    noteId: string,
    itemId: string,
    patch: { text?: string; checked?: boolean; indent?: 0 | 1; position?: string },
  ): Promise<ItemPatchResult> {
    return this.json(`/api/notes/${noteId}/items/${itemId}`, { method: 'PATCH', body: patch });
  }

  deleteItem(noteId: string, itemId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/items/${itemId}`, { method: 'DELETE' });
  }

  uncheckAll(noteId: string): Promise<ItemsReplacedResult> {
    return this.json(`/api/notes/${noteId}/uncheck-all`, { method: 'POST' });
  }

  deleteChecked(noteId: string): Promise<ItemsReplacedResult> {
    return this.json(`/api/notes/${noteId}/delete-checked`, { method: 'POST' });
  }

  // ---------------------------------------------------------------- labels

  listLabels(): Promise<Label[]> {
    return this.json('/api/labels');
  }

  createLabel(name: string, parentId: string | null = null): Promise<Label> {
    return this.json('/api/labels', { method: 'POST', body: { name, parentId } });
  }

  renameLabel(id: string, name?: string, parentId?: string | null): Promise<Label> {
    // Only what the caller asked for: PATCH treats an absent key as "leave it",
    // and sending `parentId: null` by accident would unfile the label.
    const body: { name?: string; parentId?: string | null } = {};
    if (name !== undefined) body.name = name;
    if (parentId !== undefined) body.parentId = parentId;
    return this.json(`/api/labels/${id}`, { method: 'PATCH', body });
  }

  deleteLabel(id: string): Promise<void> {
    return this.json(`/api/labels/${id}`, { method: 'DELETE' });
  }

  addLabelToNote(noteId: string, labelId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/labels/${labelId}`, { method: 'PUT' });
  }

  removeLabelFromNote(noteId: string, labelId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/labels/${labelId}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- reminders

  setReminder(noteId: string, input: SetReminder): Promise<Reminder> {
    return this.json(`/api/notes/${noteId}/reminder`, { method: 'PUT', body: input });
  }

  deleteReminder(noteId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/reminder`, { method: 'DELETE' });
  }

  snoozeReminder(noteId: string, until: string): Promise<Reminder> {
    return this.json(`/api/notes/${noteId}/reminder/snooze`, { method: 'POST', body: { until } });
  }

  dismissReminder(noteId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/reminder/dismiss`, { method: 'POST' });
  }

  // ---------------------------------------------------------------- search & links

  search(query: SearchQuery): Promise<SearchResult[]> {
    return this.json('/api/search', {
      query: {
        q: query.q,
        type: query.type,
        label: query.label,
        color: query.color,
        collaborator: query.collaborator,
      },
    });
  }

  getLinkPreview(url: string): Promise<LinkPreview> {
    return this.json('/api/link-previews', { query: { url } });
  }

  // ---------------------------------------------------------------- settings

  getSettings(): Promise<UserSettings> {
    return this.json('/api/settings');
  }

  updateSettings(patch: UserSettingsPatch): Promise<UserSettings> {
    return this.json('/api/settings', { method: 'PATCH', body: patch });
  }

  getStorageUsage(): Promise<StorageUsage> {
    return this.json('/api/storage');
  }

  // ---------------------------------------------------------------- collaborators

  listCollaborators(noteId: string): Promise<Collaborator[]> {
    return this.json(`/api/notes/${noteId}/collaborators`);
  }

  addCollaborator(
    noteId: string,
    email: string,
    role: InviteRole = 'collaborator',
  ): Promise<Collaborator> {
    return this.json(`/api/notes/${noteId}/collaborators`, {
      method: 'POST',
      body: { email, role },
    });
  }

  setCollaboratorRole(noteId: string, userId: string, role: InviteRole): Promise<Collaborator> {
    return this.json(`/api/notes/${noteId}/collaborators/${userId}`, {
      method: 'PATCH',
      body: { role },
    });
  }

  removeCollaborator(noteId: string, userId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/collaborators/${userId}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- share link

  getShareLink(noteId: string): Promise<ShareLink> {
    return this.json(`/api/notes/${noteId}/share-link`);
  }

  createShareLink(noteId: string, expiresInDays: number | null): Promise<ShareLink> {
    return this.json(`/api/notes/${noteId}/share-link`, {
      method: 'POST',
      body: { expiresInDays },
    });
  }

  revokeShareLink(noteId: string): Promise<void> {
    return this.json(`/api/notes/${noteId}/share-link`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- calendar

  getCalendarFeed(): Promise<CalendarFeed> {
    return this.json('/api/calendar/token');
  }

  rotateCalendarFeed(): Promise<CalendarFeed> {
    return this.json('/api/calendar/token', { method: 'POST' });
  }

  revokeCalendarFeed(): Promise<void> {
    return this.json('/api/calendar/token', { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- attachments

  uploadImage(noteId: string, data: Uint8Array, filename = 'image.png'): Promise<Attachment> {
    const form = new FormData();
    form.append('file', new Blob([data]), filename);
    return this.json(`/api/notes/${noteId}/attachments`, { method: 'POST', form });
  }

  uploadAudio(noteId: string, data: Uint8Array, filename = 'audio.webm'): Promise<Attachment> {
    const form = new FormData();
    form.append('file', new Blob([data]), filename);
    return this.json(`/api/notes/${noteId}/audio`, { method: 'POST', form });
  }

  /** The name is content here — it is what the chip shows and what downloads. */
  uploadFile(noteId: string, data: Uint8Array, filename: string): Promise<Attachment> {
    const form = new FormData();
    form.append('file', new Blob([data]), filename);
    return this.json(`/api/notes/${noteId}/files`, { method: 'POST', form });
  }

  downloadAttachment(
    id: string,
    variant: 'file' | 'thumb',
  ): Promise<{ data: Uint8Array; mime: string }> {
    return this.binary(`/api/attachments/${id}/${variant}`);
  }

  deleteAttachment(id: string): Promise<void> {
    return this.json(`/api/attachments/${id}`, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------- drawings

  getDrawing(attachmentId: string): Promise<DrawingData> {
    return this.json(`/api/attachments/${attachmentId}/drawing`);
  }

  createDrawing(noteId: string, png: Uint8Array, drawing: DrawingData): Promise<Attachment> {
    return this.json(`/api/notes/${noteId}/drawings`, {
      method: 'POST',
      form: drawingForm(png, drawing),
    });
  }

  updateDrawing(attachmentId: string, png: Uint8Array, drawing: DrawingData): Promise<Attachment> {
    return this.json(`/api/attachments/${attachmentId}/drawing`, {
      method: 'PUT',
      form: drawingForm(png, drawing),
    });
  }

  // ---------------------------------------------------------------- import/export

  startExport(): Promise<{ jobId: string }> {
    return this.json('/api/export', { method: 'POST' });
  }

  importTakeout(zip: Uint8Array, filename = 'takeout.zip'): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append('file', new Blob([zip], { type: 'application/zip' }), filename);
    return this.json('/api/import/takeout', { method: 'POST', form });
  }

  importMarkdown(files: MarkdownImportFile[]): Promise<{ imported: number; skipped: number }> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', new Blob([file.text], { type: 'text/markdown' }), file.filename);
    }
    return this.json('/api/import/markdown', { method: 'POST', form });
  }

  getJob(id: string): Promise<Job> {
    return this.json(`/api/jobs/${id}`);
  }

  async downloadExport(jobId: string): Promise<Uint8Array> {
    return (await this.binary(`/api/jobs/${jobId}/download`)).data;
  }
}
