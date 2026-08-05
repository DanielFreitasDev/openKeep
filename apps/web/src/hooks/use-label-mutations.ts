import type { Label, PatchLabel } from '@openkeep/shared';
import { flattenLabelTree, labelSubtreeIds, positionBetween, sortLabels } from '@openkeep/shared';
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
      (err.code === 'label_limit_reached' ||
        err.code === 'label_exists' ||
        err.code === 'label_cycle')
    ) {
      show({ message: err.problem.detail ?? err.problem.title });
    }
    void queryClient.invalidateQueries({ queryKey: labelsQuery.queryKey });
  };

  /** The server's order: depth-first, sibling position first, name as tiebreak. */
  const ordered = (l: Label[]) => flattenLabelTree(l).map((f) => f.label);

  const create = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId?: string | null }) =>
      createLabelApi(name, parentId ?? null),
    onSuccess: (label) => setLabels((old) => ordered([...(old ?? []), label])),
    onError: onLabelError,
  });

  /** Rename / colour / emoji / parent / position — one optimistic PATCH. */
  const patch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchLabel }) => patchLabelApi(id, patch),
    onMutate: ({ id, patch }) =>
      setLabels((old) => ordered((old ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)))),
    onError: onLabelError,
  });

  const rename = {
    mutate: ({ id, name }: { id: string; name: string }) => patch.mutate({ id, patch: { name } }),
  };

  const current = () => queryClient.getQueryData(labelsQuery.queryKey) ?? [];

  /**
   * The one primitive behind every rearrangement: put `id` at `toIndex` of
   * `parentId`'s children. Reparenting and reordering are the same gesture in
   * a tree — one drag sets both — so they travel as a single PATCH and a move
   * is never briefly half-applied.
   *
   * `toIndex` counts in the destination list *without* the moved row, and only
   * that row is written: its position comes from the neighbours it lands
   * between (DECISIONS #12).
   */
  const move = (id: string, parentId: string | null, toIndex: number) => {
    const all = current();
    const me = all.find((l) => l.id === id);
    if (!me) return;
    // A cycle is a 400 from the server; catching it here keeps the optimistic
    // update from briefly drawing a tree that cannot exist.
    if (parentId !== null && labelSubtreeIds(all, id).includes(parentId)) return;

    const without = sortLabels(all.filter((l) => l.parentId === parentId && l.id !== id));
    const clamped = Math.max(0, Math.min(without.length, toIndex));
    const prev = without[clamped - 1]?.position ?? null;
    const next = without[clamped]?.position ?? null;
    // Already in that gap under that parent: a drop that moved nothing writes
    // nothing.
    const settled =
      me.parentId === parentId &&
      (prev === null || me.position > prev) &&
      (next === null || me.position < next);
    if (settled) return;

    const position = positionBetween(prev, next);
    patch.mutate({
      id,
      patch: me.parentId === parentId ? { position } : { parentId, position },
    });
  };

  /** Move within the current sibling group. */
  const reorder = (id: string, toIndex: number) => {
    const me = current().find((l) => l.id === id);
    if (me) move(id, me.parentId, toIndex);
  };

  /** Re-home a label (and its subtree); it lands last among its new siblings. */
  const setParent = (id: string, parentId: string | null) =>
    move(id, parentId, Number.MAX_SAFE_INTEGER);

  const remove = useMutation({
    mutationFn: (id: string) => deleteLabelApi(id),
    onMutate: (id) => {
      // Deleting a folder takes its contents: the server cascades the subtree,
      // so the cache has to drop the same set, not just the row clicked.
      const gone = new Set(labelSubtreeIds(current(), id));
      setLabels((old) => (old ?? []).filter((l) => !gone.has(l.id)));
      queryClient.setQueryData(notesQuery.queryKey, (old) =>
        old?.map((n) =>
          n.labelIds.some((x) => gone.has(x))
            ? { ...n, labelIds: n.labelIds.filter((x) => !gone.has(x)) }
            : n,
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

  return { create, patch, rename, move, reorder, setParent, remove, setNoteLabel };
}
