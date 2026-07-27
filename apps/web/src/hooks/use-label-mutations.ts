import type { Label } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api.js';
import {
  addLabelToNoteApi,
  createLabelApi,
  deleteLabelApi,
  labelsQuery,
  removeLabelFromNoteApi,
  renameLabelApi,
} from '../lib/labels-api.js';
import { mergeNote } from '../lib/note-selectors.js';
import { notesQuery } from '../lib/notes-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';

export function useLabelMutations() {
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);

  const setLabels = (updater: (l: Label[] | undefined) => Label[]) =>
    queryClient.setQueryData(labelsQuery.queryKey, updater);

  const onLabelError = (err: unknown) => {
    if (
      err instanceof ApiError &&
      (err.code === 'label_limit_reached' || err.code === 'label_exists')
    ) {
      show({ message: err.problem.detail ?? err.problem.title });
    }
    void queryClient.invalidateQueries({ queryKey: labelsQuery.queryKey });
  };

  const sortByName = (l: Label[]) =>
    [...l].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const create = useMutation({
    mutationFn: (name: string) => createLabelApi(name),
    onSuccess: (label) => setLabels((old) => sortByName([...(old ?? []), label])),
    onError: onLabelError,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameLabelApi(id, name),
    onMutate: ({ id, name }) =>
      setLabels((old) => sortByName((old ?? []).map((l) => (l.id === id ? { ...l, name } : l)))),
    onError: onLabelError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteLabelApi(id),
    onMutate: (id) => {
      setLabels((old) => (old ?? []).filter((l) => l.id !== id));
      // Cascades server-side; mirror in the corpus cache.
      queryClient.setQueryData(notesQuery.queryKey, (old) =>
        old?.map((n) =>
          n.labelIds.includes(id) ? { ...n, labelIds: n.labelIds.filter((x) => x !== id) } : n,
        ),
      );
    },
  });

  const setNoteLabel = useMutation({
    mutationFn: ({ noteId, labelId, on }: { noteId: string; labelId: string; on: boolean }) =>
      on ? addLabelToNoteApi(noteId, labelId) : removeLabelFromNoteApi(noteId, labelId),
    onMutate: ({ noteId, labelId, on }) => {
      queryClient.setQueryData(notesQuery.queryKey, (old) => {
        const note = old?.find((n) => n.id === noteId);
        if (!old || !note) return old;
        const labelIds = on
          ? [...new Set([...note.labelIds, labelId])]
          : note.labelIds.filter((x) => x !== labelId);
        return mergeNote(old, noteId, { labelIds });
      });
    },
  });

  return { create, rename, remove, setNoteLabel };
}
