import type { Label, PatchLabel } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

export const labelsQuery = queryOptions({
  queryKey: ['labels'],
  queryFn: () => api<Label[]>('/api/labels'),
  staleTime: 60_000,
});

export const createLabelApi = (name: string) =>
  api<Label>('/api/labels', { method: 'POST', body: { name } });

/** Rename, recolour, re-emoji and reorder all ride the same PATCH. */
export const patchLabelApi = (id: string, patch: PatchLabel) =>
  api<Label>(`/api/labels/${id}`, { method: 'PATCH', body: patch });

export const deleteLabelApi = (id: string) =>
  api<undefined>(`/api/labels/${id}`, { method: 'DELETE' });

export const addLabelToNoteApi = (noteId: string, labelId: string) =>
  api<undefined>(`/api/notes/${noteId}/labels/${labelId}`, { method: 'PUT' });

export const removeLabelFromNoteApi = (noteId: string, labelId: string) =>
  api<undefined>(`/api/notes/${noteId}/labels/${labelId}`, { method: 'DELETE' });
