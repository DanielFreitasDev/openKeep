import type { Collaborator, FullNote, InviteRole } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../lib/api.js';
import { mergeNote, removeNote } from '../lib/note-selectors.js';
import { notesQuery } from '../lib/notes-api.js';
import { sessionQuery } from '../lib/queries.js';
import { useSnackbarStore } from '../stores/snackbar.js';

export function useCollaboratorMutations() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('sharing');
  const show = useSnackbarStore((s) => s.show);
  const { data: session } = useQuery(sessionQuery);

  const patchNote = (noteId: string, fn: (n: FullNote) => Partial<FullNote>) =>
    queryClient.setQueryData(notesQuery.queryKey, (old) => {
      const note = old?.find((n) => n.id === noteId);
      if (!old || !note) return old;
      return mergeNote(old, noteId, fn(note));
    });

  const invite = useMutation({
    mutationFn: ({
      noteId,
      email,
      role = 'collaborator',
    }: {
      noteId: string;
      email: string;
      role?: InviteRole;
    }) =>
      api<Collaborator>(`/api/notes/${noteId}/collaborators`, {
        method: 'POST',
        body: { email, role },
      }),
    onSuccess: (collaborator, { noteId }) =>
      patchNote(noteId, (n) => ({ collaborators: [...n.collaborators, collaborator] })),
    onError: (err) => {
      show({
        message:
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : t('inviteFailed'),
      });
    },
  });

  const remove = useMutation({
    mutationFn: ({ noteId, userId }: { noteId: string; userId: string; onLeft?: () => void }) =>
      api<undefined>(`/api/notes/${noteId}/collaborators/${userId}`, { method: 'DELETE' }),
    onSuccess: (_d, { noteId, userId, onLeft }) => {
      if (userId === session?.user.id) {
        // I left — the note disappears from my board.
        queryClient.setQueryData(notesQuery.queryKey, (old) => removeNote(old, noteId));
        onLeft?.();
        return;
      }
      patchNote(noteId, (n) => ({
        collaborators: n.collaborators.filter((c) => c.userId !== userId),
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: ({ noteId, userId, role }: { noteId: string; userId: string; role: InviteRole }) =>
      api<Collaborator>(`/api/notes/${noteId}/collaborators/${userId}`, {
        method: 'PATCH',
        body: { role },
      }),
    onSuccess: (collaborator, { noteId }) =>
      patchNote(noteId, (n) => ({
        collaborators: n.collaborators.map((c) =>
          c.userId === collaborator.userId ? collaborator : c,
        ),
      })),
    onError: (err) => {
      show({
        message:
          err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : t('inviteFailed'),
      });
    },
  });

  return { invite, remove, setRole };
}
