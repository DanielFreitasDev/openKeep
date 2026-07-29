import type { DrawingData, FullNote } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api.js';
import {
  deleteAttachmentApi,
  updateDrawingApi,
  uploadAttachment,
  uploadDrawingApi,
} from '../lib/attachments-api.js';
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

  const uploadFailedToast = (err: unknown) =>
    show({
      message:
        err instanceof ApiError && err.problem.detail ? err.problem.detail : t('uploadFailed'),
    });

  const uploadDrawing = useMutation({
    mutationFn: ({ noteId, file, drawing }: { noteId: string; file: File; drawing: DrawingData }) =>
      uploadDrawingApi(noteId, file, drawing),
    onSuccess: (attachment, { noteId }) =>
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] })),
    onError: uploadFailedToast,
  });

  const updateDrawing = useMutation({
    mutationFn: ({
      attachmentId,
      file,
      drawing,
    }: {
      noteId: string;
      attachmentId: string;
      file: File;
      drawing: DrawingData;
    }) => updateDrawingApi(attachmentId, file, drawing),
    onSuccess: (attachment, { noteId }) =>
      setNote(noteId, (n) => ({
        attachments: n.attachments.map((a) => (a.id === attachment.id ? attachment : a)),
      })),
    onError: uploadFailedToast,
  });

  return { upload, remove, uploadDrawing, updateDrawing };
}
