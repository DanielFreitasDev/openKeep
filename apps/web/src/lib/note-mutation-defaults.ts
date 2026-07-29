import type { CreateNote, FullNote, PatchNoteContent, PatchNoteState } from '@openkeep/shared';
import { positionBefore } from '@openkeep/shared';
import { MutationObserver, type QueryClient } from '@tanstack/react-query';
import i18n from '../i18n/index.js';
import { useSnackbarStore } from '../stores/snackbar.js';
import { ApiError } from './api.js';
import { clearAckedDraftFields, clearComposerDraftIfNote } from './drafts.js';
import { mergeNote, removeNote, upsertNote } from './note-selectors.js';
import * as apiNotes from './notes-api.js';
import { notesQuery } from './notes-api.js';

/**
 * The offline outbox. create/patchContent/patchState carry a mutationKey and
 * register their full lifecycle here, so a mutation paused while offline can
 * be dehydrated to IndexedDB and resumed after a reload — components hold
 * only the key (useMutation({ mutationKey })), never the implementation.
 */
export const noteMutationKeys = {
  create: ['notes', 'create'] as const,
  patchContent: ['notes', 'patchContent'] as const,
  patchState: ['notes', 'patchState'] as const,
};

/** Re-fires a keyed mutation (defaults supply the lifecycle); errors re-toast. */
function refire(queryClient: QueryClient, mutationKey: readonly string[], variables: unknown) {
  const observer = new MutationObserver<unknown, Error, unknown>(queryClient, {
    mutationKey: [...mutationKey],
  });
  void observer.mutate(variables).catch(() => undefined);
}

export function registerNoteMutationDefaults(queryClient: QueryClient) {
  const setNotes = (updater: (list: FullNote[] | undefined) => FullNote[]) =>
    queryClient.setQueryData(notesQuery.queryKey, updater);

  const saveFailedToast = (retry: () => void) =>
    useSnackbarStore.getState().show({
      message: i18n.t('common:saveFailed'),
      actionLabel: i18n.t('common:retry'),
      onAction: retry,
    });

  queryClient.setMutationDefaults(noteMutationKeys.create, {
    mutationFn: async (input: CreateNote & { id: string }): Promise<FullNote> => {
      try {
        return await apiNotes.createNote(input);
      } catch (err) {
        // Replay of a create that already landed (client-generated id):
        // treat the 409 as delivered and converge on the server copy.
        if (err instanceof ApiError && err.status === 409 && err.code === 'conflict') {
          const existing = queryClient
            .getQueryData(notesQuery.queryKey)
            ?.find((n) => n.id === input.id);
          if (existing) return existing;
          void queryClient.invalidateQueries({ queryKey: notesQuery.queryKey });
        }
        throw err;
      }
    },
    onMutate: (input: CreateNote & { id: string }) => {
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
      saveFailedToast(() => refire(queryClient, noteMutationKeys.create, input));
    },
  });

  queryClient.setMutationDefaults(noteMutationKeys.patchContent, {
    mutationFn: ({ id, patch }: { id: string; patch: PatchNoteContent }) =>
      apiNotes.patchNoteContent(id, patch),
    onMutate: ({ id, patch }: { id: string; patch: PatchNoteContent }) => {
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
      // Resumed-after-reload mutations may lose their context; sentAt 0 keeps
      // the clear equality-only, which never over-clears.
      clearAckedDraftFields(result.id, patch, ctx?.sentAt ?? 0);
    },
    onError: (_e, vars) => {
      saveFailedToast(() => refire(queryClient, noteMutationKeys.patchContent, vars));
    },
  });

  queryClient.setMutationDefaults(noteMutationKeys.patchState, {
    mutationFn: ({ id, patch }: { id: string; patch: PatchNoteState }) =>
      apiNotes.patchNoteState(id, patch),
    onMutate: ({ id, patch }: { id: string; patch: PatchNoteState }) => {
      setNotes((old) => mergeNote(old, id, patch));
    },
    onSuccess: (result) => {
      const { id, ...state } = result;
      setNotes((old) => mergeNote(old, id, state));
    },
    onError: (_e, vars) => {
      saveFailedToast(() => refire(queryClient, noteMutationKeys.patchState, vars));
    },
  });
}
