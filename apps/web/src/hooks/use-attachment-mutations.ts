import type { FullNote } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api.js';
import { deleteAttachmentApi, uploadAttachment } from '../lib/attachments-api.js';
import { mergeNote } from '../lib/note-selectors.js';
import { notesQuery } from '../lib/notes-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';

export function useAttachmentMutations() {
  const queryClient = useQueryClient();
  const { t } = useTranslation('notes');
  const show = useSnackbarStore((s) => s.show);

  const setNote = (noteId: string, fn: (n: FullNote) => Partial<FullNote>) =>
    queryClient.setQueryData(notesQuery.queryKey, (old) => {
      const note = old?.find((n) => n.id === noteId);
      if (!old || !note) return old;
      return mergeNote(old, noteId, fn(note));
    });

  const upload = useMutation({
    mutationFn: ({ noteId, file }: { noteId: string; file: File }) =>
      uploadAttachment(noteId, file),
    onSuccess: (attachment, { noteId }) =>
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] })),
    onError: (err) => {
      show({
        message:
          err instanceof ApiError && err.problem.detail ? err.problem.detail : t('uploadFailed'),
      });
    },
  });

  const remove = useMutation({
    mutationFn: ({ attachmentId }: { noteId: string; attachmentId: string }) =>
      deleteAttachmentApi(attachmentId),
    onMutate: ({ noteId, attachmentId }) =>
      setNote(noteId, (n) => ({ attachments: n.attachments.filter((a) => a.id !== attachmentId) })),
  });

  return { upload, remove };
}
