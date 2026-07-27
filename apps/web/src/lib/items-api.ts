import type {
  CreateItemInput,
  FullNote,
  ItemPatchResult,
  ItemsReplacedResult,
  NoteItem,
  PatchItemInput,
} from '@openkeep/shared';
import type { QueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { mergeNote } from './note-selectors.js';
import { notesQuery } from './notes-api.js';

export const createItemApi = (noteId: string, input: CreateItemInput) =>
  api<NoteItem>(`/api/notes/${noteId}/items`, { method: 'POST', body: input });

export const patchItemApi = (noteId: string, itemId: string, patch: PatchItemInput) =>
  api<ItemPatchResult>(`/api/notes/${noteId}/items/${itemId}`, { method: 'PATCH', body: patch });

export const deleteItemApi = (noteId: string, itemId: string) =>
  api<undefined>(`/api/notes/${noteId}/items/${itemId}`, { method: 'DELETE' });

export const uncheckAllApi = (noteId: string) =>
  api<ItemsReplacedResult>(`/api/notes/${noteId}/uncheck-all`, { method: 'POST' });

export const deleteCheckedApi = (noteId: string) =>
  api<ItemsReplacedResult>(`/api/notes/${noteId}/delete-checked`, { method: 'POST' });

/** Update one note's items inside the ['notes'] corpus cache. */
export function updateCachedItems(
  queryClient: QueryClient,
  noteId: string,
  updater: (items: NoteItem[]) => NoteItem[],
) {
  queryClient.setQueryData(notesQuery.queryKey, (old): FullNote[] | undefined => {
    if (!old) return old;
    const note = old.find((n) => n.id === noteId);
    if (!note) return old;
    return mergeNote(old, noteId, { items: updater(note.items) });
  });
}
