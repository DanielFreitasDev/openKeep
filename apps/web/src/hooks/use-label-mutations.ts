import type { Label, PatchLabel } from '@openkeep/shared';
import { positionBetween } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api.js';
import {
  addLabelToNoteApi,
  createLabelApi,
  deleteLabelApi,
  labelsQuery,
  patchLabelApi,
  removeLabelFromNoteApi,
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

  /** The server's order: manual position first, name only as the tiebreak. */
  const sorted = (l: Label[]) =>
    [...l].sort(
      (a, b) =>
        (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) ||
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );

  const create = useMutation({
    mutationFn: (name: string) => createLabelApi(name),
    onSuccess: (label) => setLabels((old) => sorted([...(old ?? []), label])),
    onError: onLabelError,
  });

  /** Rename / colour / emoji / position — one optimistic PATCH. */
  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchLabel }) => patchLabelApi(id, patch),
    onMutate: ({ id, patch }) =>
      setLabels((old) => sorted((old ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)))),
    onError: onLabelError,
  });

  const rename = {
    mutate: ({ id, name }: { id: string; name: string }) => patch.mutate({ id, patch: { name } }),
  };

  /**
   * Drop `id` at `toIndex` of the CURRENT order. The position is computed from
   * the neighbours it lands between, so only the moved row is written.
   */
  const reorder = (id: string, toIndex: number) => {
    const current = sorted(queryClient.getQueryData(labelsQuery.queryKey) ?? []);
    const without = current.filter((l) => l.id !== id);
    const clamped = Math.max(0, Math.min(without.length, toIndex));
    const prev = without[clamped - 1]?.position ?? null;
    const next = without[clamped]?.position ?? null;
    // Already sitting in that gap: a drop that moved nothing writes nothing.
    const me = current.find((l) => l.id === id);
    if (me && (prev === null || me.position > prev) && (next === null || me.position < next))
      return;
    patch.mutate({ id, patch: { position: positionBetween(prev, next) } });
  };

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

  return { create, patch, rename, reorder, remove, setNoteLabel };
}
