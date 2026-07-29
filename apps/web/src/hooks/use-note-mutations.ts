import type {
  CreateNote,
  FullNote,
  NoteContentResult,
  NoteStateResult,
  PatchNoteContent,
  PatchNoteState,
} from '@openkeep/shared';
import { newId } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checkItemWithCascade } from '../components/notes/checklist-logic.js';
import { removeNoteDraft } from '../lib/drafts.js';
import {
  deleteCheckedApi,
  patchItemApi,
  uncheckAllApi,
  updateCachedItems,
} from '../lib/items-api.js';
import { noteMutationKeys } from '../lib/note-mutation-defaults.js';
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

  // create/patchContent/patchState are the offline outbox: their lifecycle
  // (optimistic merge, ack merge, draft clearing, failure toast) is registered
  // once in note-mutation-defaults.ts so a queued mutation can be resumed
  // after a reload — components hold only the key.
  const create = useMutation<FullNote, Error, CreateNote & { id: string }>({
    mutationKey: noteMutationKeys.create,
  });

  const patchContent = useMutation<
    NoteContentResult,
    Error,
    { id: string; patch: PatchNoteContent },
    { sentAt: number }
  >({ mutationKey: noteMutationKeys.patchContent });

  const patchState = useMutation<NoteStateResult, Error, { id: string; patch: PatchNoteState }>({
    mutationKey: noteMutationKeys.patchState,
  });

  const trash = useMutation({
    mutationFn: (id: string) => apiNotes.trashNote(id),
    onMutate: (id) =>
      setNotes((old) => mergeNote(old, id, { trashedAt: new Date().toISOString(), pinned: false })),
    onSuccess: (note) => {
      setNotes((old) => upsertNote(old, note));
      removeNoteDraft(note.id);
    },
  });

  const restore = useMutation({
    mutationFn: (id: string) => apiNotes.restoreNote(id),
    onMutate: (id) => setNotes((old) => mergeNote(old, id, { trashedAt: null })),
    onSuccess: (note) => setNotes((old) => upsertNote(old, note)),
  });

  const deleteForever = useMutation({
    mutationFn: (id: string) => apiNotes.deleteNoteForever(id),
    onMutate: (id) => {
      setNotes((old) => removeNote(old, id));
      removeNoteDraft(id);
    },
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

  /**
   * Ticking a box straight from a card (Keep does not make you open the note).
   * The editor drives its own local rows, so this path only touches the cache.
   */
  const toggleItem = useMutation({
    mutationFn: ({
      noteId,
      itemId,
      checked,
    }: {
      noteId: string;
      itemId: string;
      checked: boolean;
    }) => patchItemApi(noteId, itemId, { checked }),
    onMutate: ({ noteId, itemId, checked }) =>
      updateCachedItems(queryClient, noteId, (items) =>
        checkItemWithCascade(items, itemId, checked),
      ),
    onSuccess: (result, { noteId }) =>
      updateCachedItems(queryClient, noteId, (items) => {
        const acked = new Map([result.item, ...result.cascaded].map((i) => [i.id, i]));
        return items.map((i) => acked.get(i.id) ?? i);
      }),
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

  /** Bulk trash (selection bar + Delete key): one snackbar restores them all. */
  const trashManyWithUndo = (ids: string[]) => {
    if (ids.length === 0) return;
    for (const id of ids) trash.mutate(id);
    show({
      message: t('notesTrashed', { count: ids.length }),
      actionLabel: t('common:undo'),
      onAction: () => {
        for (const id of ids) restore.mutate(id);
      },
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
    toggleItem,
    deleteChecked,
    archiveWithUndo,
    unarchiveWithUndo,
    trashWithUndo,
    trashManyWithUndo,
    restoreWithUndo,
    togglePin,
    newNoteId: newId,
  };
}
