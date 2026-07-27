import type {
  CreateNote,
  FullNote,
  NoteContentResult,
  NoteStateResult,
  NoteVersionMeta,
  PatchNoteContent,
  PatchNoteState,
} from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

/** The corpus: ALL notes (active + archived + trashed) in one cache entry. */
export const notesQuery = queryOptions({
  queryKey: ['notes'],
  queryFn: () => api<FullNote[]>('/api/notes'),
  staleTime: 30_000,
});

export const createNote = (input: CreateNote & { id: string }) =>
  api<FullNote>('/api/notes', { method: 'POST', body: input });

export const patchNoteContent = (id: string, patch: PatchNoteContent) =>
  api<NoteContentResult>(`/api/notes/${id}`, { method: 'PATCH', body: patch });

export const patchNoteState = (id: string, patch: PatchNoteState) =>
  api<NoteStateResult>(`/api/notes/${id}/state`, { method: 'PATCH', body: patch });

export const trashNote = (id: string) =>
  api<FullNote>(`/api/notes/${id}/trash`, { method: 'POST' });

export const restoreNote = (id: string) =>
  api<FullNote>(`/api/notes/${id}/restore`, { method: 'POST' });

export const deleteNoteForever = (id: string) =>
  api<undefined>(`/api/notes/${id}`, { method: 'DELETE' });

export const emptyTrash = () =>
  api<{ deleted: number }>('/api/notes/trash/empty', { method: 'POST' });

export const copyNote = (id: string) => api<FullNote>(`/api/notes/${id}/copy`, { method: 'POST' });

export const convertNote = (id: string, to: 'text' | 'list') =>
  api<FullNote>(`/api/notes/${id}/convert`, { method: 'POST', body: { to } });

export const listVersions = (id: string) => api<NoteVersionMeta[]>(`/api/notes/${id}/versions`);

export const restoreVersion = (id: string, versionId: string) =>
  api<FullNote>(`/api/notes/${id}/versions/${versionId}/restore`, { method: 'POST' });

export const versionDownloadUrl = (id: string, versionId: string) =>
  `/api/notes/${id}/versions/${versionId}/download`;
