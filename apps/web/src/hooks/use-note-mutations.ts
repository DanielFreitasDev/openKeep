import type { CreateNote, FullNote, PatchNoteContent, PatchNoteState } from '@openkeep/shared';
import { newId, positionBefore } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { checkItemWithCascade } from '../components/notes/checklist-logic.js';
import { clearAckedDraftFields, clearComposerDraftIfNote, removeNoteDraft } from '../lib/drafts.js';
import {
  deleteCheckedApi,
  patchItemApi,
  uncheckAllApi,
  updateCachedItems,
} from '../lib/items-api.js';
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
        labelIds: [],
        attachments: [],
        reminder: null,
        collaborators: [],
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
    onSuccess: (note) => {
      setNotes((old) => upsertNote(old, note));
      clearComposerDraftIfNote(note.id);
    },
    onError: (_e, input) => {
      setNotes((old) => removeNote(old, input.id));
      show({
        message: t('common:saveFailed'),
        actionLabel: t('common:retry'),
        onAction: () => create.mutate(input),
      });
    },
  });

  const patchContent = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchNoteContent }) =>
      apiNotes.patchNoteContent(id, patch),
    onMutate: ({ id, patch }) => {
      setNotes((old) => mergeNote(old, id, patch));
      return { sentAt: Date.now() };
    },
    onSuccess: (result, { patch }, ctx) => {
      setNotes((old) =>
        mergeNote(old, result.id, {
          title: result.title,
          bodyHtml: result.bodyHtml,
          hasLinks: result.hasLinks,
          updatedAt: result.updatedAt,
        }),
      );
      clearAckedDraftFields(result.id, patch, ctx?.sentAt ?? Date.now());
    },
    onError: (_e, vars) => {
      show({
        message: t('common:saveFailed'),
        actionLabel: t('common:retry'),
        onAction: () => patchContent.mutate(vars),
      });
    },
  });

  const patchState = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PatchNoteState }) =>
      apiNotes.patchNoteState(id, patch),
    onMutate: ({ id, patch }) => setNotes((old) => mergeNote(old, id, patch)),
    onSuccess: (result) => {
      const { id, ...state } = result;
      setNotes((old) => mergeNote(old, id, state));
    },
    onError: (_e, vars) => {
      show({
        message: t('common:saveFailed'),
        actionLabel: t('common:retry'),
        onAction: () => patchState.mutate(vars),
      });
    },
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
