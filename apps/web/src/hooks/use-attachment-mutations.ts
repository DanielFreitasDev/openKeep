import type { DrawingData, FullNote } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api.js';
import {
  deleteAttachmentApi,
  updateDrawingApi,
  uploadAttachment,
  uploadAudioApi,
  uploadDrawingApi,
  uploadFileApi,
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

  // Registered here rather than at the call site on purpose: the editor can
  // unmount while a take is still uploading (closing the note stops and keeps
  // the recording), and only callbacks declared on the mutation itself still
  // run to put the attachment in the cache.
  const uploadAudio = useMutation({
    mutationFn: ({ noteId, file }: { noteId: string; file: File }) => uploadAudioApi(noteId, file),
    onSuccess: (attachment, { noteId }) =>
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] })),
    onError: (err) => uploadFailedToast(err),
  });

  // Declared here for the same reason as the recording above: closing the note
  // must not cancel a document that is already on its way up.
  const uploadFile = useMutation({
    mutationFn: ({ noteId, file }: { noteId: string; file: File }) => uploadFileApi(noteId, file),
    onSuccess: (attachment, { noteId }) =>
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] })),
    onError: (err) => uploadFailedToast(err),
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

  return { upload, uploadAudio, uploadFile, remove, uploadDrawing, updateDrawing };
}
