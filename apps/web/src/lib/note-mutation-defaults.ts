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

/**
 * One note, one queue: writes to the same note leave in the order they were
 * made.
 *
 * React Query resumes paused mutations concurrently, so an outbox drained on
 * reconnect used to put three PATCHes for one note on the wire at once and let
 * the server apply whichever arrived last — "last writer wins" quietly became
 * "last arriver wins", and the order of arrival is not the order somebody
 * typed. That is how an offline edit could end up overwritten by an earlier
 * value of the same field. Chaining by note id costs nothing at this volume
 * (saves are debounced) and leaves writes to *other* notes untouched, so a
 * slow request never holds up a different card.
 *
 * A failed link must not stall the queue behind it, hence `then(run, run)`;
 * the caller still gets the real rejection so `onError` fires as before.
 */
const noteWriteChain = new Map<string, Promise<unknown>>();

function inOrder<T>(noteId: string, run: () => Promise<T>): Promise<T> {
  const previous = noteWriteChain.get(noteId) ?? Promise.resolve();
  const result = previous.then(run, run);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  noteWriteChain.set(noteId, settled);
  void settled.then(() => {
    // Only the tail clears the entry, or a slower predecessor would drop a
    // queue that is still being written to.
    if (noteWriteChain.get(noteId) === settled) noteWriteChain.delete(noteId);
  });
  return result;
}

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
        return await inOrder(input.id, () => apiNotes.createNote(input));
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
        isTemplate: false,
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
      inOrder(id, () => apiNotes.patchNoteContent(id, patch)),
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
      inOrder(id, () => apiNotes.patchNoteState(id, patch)),
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
