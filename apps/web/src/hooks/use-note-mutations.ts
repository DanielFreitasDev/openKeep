import type { CreateNote, FullNote, PatchNoteContent, PatchNoteState } from '@openkeep/shared';
import { newId, positionBefore } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { deleteCheckedApi, uncheckAllApi } from '../lib/items-api.js';
import { mergeNote, removeNote, upsertNote } from '../lib/note-selectors.js';
import * as apiNotes from '../lib/notes-api.js';
import { notesQuery } from '../lib/notes-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';

/**
 * Cache policy (see ARCHITECTURE.md): no invalidate-on-success. Optimistic
 * merge on mutate; the HTTP response merges only mutated fields back. Undo is
 * an INVERSE MUTATION, never a cache rollback.
 */
export function useNoteMutations() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('notes');
  const show = useSnackbarStore((s) => s.show);

  const setNotes = (updater: (list: FullNote[] | undefined) => FullNote[]) =>
    queryClient.setQueryData(notesQuery.queryKey, updater);

  const create = useMutation({
    mutationFn: (input: CreateNote & { id: string }) => apiNotes.createNote(input),
    onMutate: (input) => {
      const list = queryClient.getQueryData(notesQuery.queryKey);
      const minPos = list
        ?.map((n) => n.position)
        .sort()
        .at(0);
      const now = new Date().toISOString();
      const optimistic: FullNote = {
        id: input.id,
        type: input.type ?? 'text',
        title: input.title ?? '',
        bodyHtml: input.bodyHtml ?? '',
        hasLinks: false,
        items: [],
        role: 'owner',
        pinned: input.pinned ?? false,
        archived: false,
        color: input.color ?? 'default',
        background: input.background ?? 'none',
        position: positionBefore(minPos ?? null),
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((old) => upsertNote(old, optimistic));
    },
    onSuccess: (note) => setNotes((old) => upsertNote(old, note)),
    onError: (_e, input) => setNotes((old) => removeNote(old, input.id)),
  });

  const patchContent = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchNoteContent }) =>
      apiNotes.patchNoteContent(id, patch),
    onMutate: ({ id, patch }) => setNotes((old) => mergeNote(old, id, patch)),
    onSuccess: (result) =>
      setNotes((old) =>
        mergeNote(old, result.id, {
          title: result.title,
          bodyHtml: result.bodyHtml,
          hasLinks: result.hasLinks,
          updatedAt: result.updatedAt,
        }),
      ),
  });

  const patchState = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchNoteState }) =>
      apiNotes.patchNoteState(id, patch),
    onMutate: ({ id, patch }) => setNotes((old) => mergeNote(old, id, patch)),
    onSuccess: (result) => {
      const { id, ...state } = result;
      setNotes((old) => mergeNote(old, id, state));
    },
  });

  const trash = useMutation({
    mutationFn: (id: string) => apiNotes.trashNote(id),
    onMutate: (id) =>
      setNotes((old) => mergeNote(old, id, { trashedAt: new Date().toISOString(), pinned: false })),
    onSuccess: (note) => setNotes((old) => upsertNote(old, note)),
  });

  const restore = useMutation({
    mutationFn: (id: string) => apiNotes.restoreNote(id),
    onMutate: (id) => setNotes((old) => mergeNote(old, id, { trashedAt: null })),
    onSuccess: (note) => setNotes((old) => upsertNote(old, note)),
  });

  const deleteForever = useMutation({
    mutationFn: (id: string) => apiNotes.deleteNoteForever(id),
    onMutate: (id) => setNotes((old) => removeNote(old, id)),
  });

  const emptyTrashMut = useMutation({
    mutationFn: () => apiNotes.emptyTrash(),
    onMutate: () => setNotes((old) => (old ?? []).filter((n) => n.trashedAt === null)),
  });

  const copy = useMutation({
    mutationFn: (id: string) => apiNotes.copyNote(id),
    onSuccess: (note) => setNotes((old) => upsertNote(old, note)),
  });

  const convert = useMutation({
    mutationFn: ({ id, to }: { id: string; to: 'text' | 'list' }) => apiNotes.convertNote(id, to),
    onSuccess: (note) => setNotes((old) => upsertNote(old, note)),
  });

  const uncheckAll = useMutation({
    mutationFn: (id: string) => uncheckAllApi(id),
    onSuccess: (res) => setNotes((old) => mergeNote(old, res.noteId, { items: res.items })),
  });

  const deleteChecked = useMutation({
    mutationFn: (id: string) => deleteCheckedApi(id),
    onSuccess: (res) => setNotes((old) => mergeNote(old, res.noteId, { items: res.items })),
  });

  // ------------------------------------------------------------ with undo

  const archiveWithUndo = (note: FullNote) => {
    // Pinning is exclusive with archive (Keep: archiving unpins visually;
    // unarchive returns to OTHERS).
    patchState.mutate({ id: note.id, patch: { archived: true, pinned: false } });
    show({
      message: t('noteArchived'),
      actionLabel: t('common:undo'),
      onAction: () =>
        patchState.mutate({ id: note.id, patch: { archived: false, pinned: note.pinned } }),
    });
  };

  const unarchiveWithUndo = (note: FullNote) => {
    patchState.mutate({ id: note.id, patch: { archived: false } });
    show({
      message: t('noteUnarchived'),
      actionLabel: t('common:undo'),
      onAction: () => patchState.mutate({ id: note.id, patch: { archived: true } }),
    });
  };

  const trashWithUndo = (note: FullNote) => {
    trash.mutate(note.id);
    show({
      message: t('noteTrashed'),
      actionLabel: t('common:undo'),
      onAction: () => restore.mutate(note.id),
    });
  };

  const restoreWithUndo = (note: FullNote) => {
    restore.mutate(note.id);
    show({
      message: t('noteRestored'),
      actionLabel: t('common:undo'),
      onAction: () => trash.mutate(note.id),
    });
  };

  const togglePin = (note: FullNote) => {
    if (note.archived && !note.pinned) {
      // Keep parity: pinning an archived note unarchives it.
      patchState.mutate({ id: note.id, patch: { pinned: true, archived: false } });
      show({
        message: t('noteUnarchivedAndPinned'),
        actionLabel: t('common:undo'),
        onAction: () =>
          patchState.mutate({ id: note.id, patch: { pinned: false, archived: true } }),
      });
    } else {
      patchState.mutate({ id: note.id, patch: { pinned: !note.pinned } });
    }
  };

  return {
    create,
    patchContent,
    patchState,
    trash,
    restore,
    deleteForever,
    emptyTrash: emptyTrashMut,
    copy,
    convert,
    uncheckAll,
    deleteChecked,
    archiveWithUndo,
    unarchiveWithUndo,
    trashWithUndo,
    restoreWithUndo,
    togglePin,
    newNoteId: newId,
  };
}
