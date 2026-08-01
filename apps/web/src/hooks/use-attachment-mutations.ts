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
import { formatBytes } from '../lib/bytes.js';
import { mergeNote } from '../lib/note-selectors.js';
import { notesQuery } from '../lib/notes-api.js';
import { storageQuery } from '../lib/queries.js';
import { useSnackbarStore } from '../stores/snackbar.js';

export function useAttachmentMutations() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation('notes');
  const show = useSnackbarStore((s) => s.show);

  // Every upload moves the account's disk usage, and Settings shows it.
  const invalidateStorage = () =>
    queryClient.invalidateQueries({ queryKey: storageQuery.queryKey });

  const setNote = (noteId: string, fn: (n: FullNote) => Partial<FullNote>) =>
    queryClient.setQueryData(notesQuery.queryKey, (old) => {
      const note = old?.find((n) => n.id === noteId);
      if (!old || !note) return old;
      return mergeNote(old, noteId, fn(note));
    });

  /**
   * A refused upload says why in the snackbar. The server's own detail is
   * English (it has no locale), so the one refusal a person can actually act on
   * — the account being full — is re-said here in their language, with the
   * ceiling read from the storage query rather than parsed back out of prose.
   */
  const uploadFailedToast = (err: unknown) => {
    if (err instanceof ApiError && err.code === 'storage_quota_exceeded') {
      const quota = queryClient.getQueryData(storageQuery.queryKey)?.quotaBytes ?? null;
      void invalidateStorage();
      show({
        message:
          quota === null
            ? t('storageFull')
            : t('storageFullOf', { quota: formatBytes(quota, i18n.language) }),
      });
      return;
    }
    show({
      message:
        err instanceof ApiError && err.problem.detail ? err.problem.detail : t('uploadFailed'),
    });
  };

  const upload = useMutation({
    mutationFn: ({ noteId, file }: { noteId: string; file: File }) =>
      uploadAttachment(noteId, file),
    onSuccess: (attachment, { noteId }) => {
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] }));
      void invalidateStorage();
    },
    onError: (err) => uploadFailedToast(err),
  });

  const remove = useMutation({
    mutationFn: ({ attachmentId }: { noteId: string; attachmentId: string }) =>
      deleteAttachmentApi(attachmentId),
    onMutate: ({ noteId, attachmentId }) =>
      setNote(noteId, (n) => ({ attachments: n.attachments.filter((a) => a.id !== attachmentId) })),
    onSuccess: () => invalidateStorage(),
  });

  // Registered here rather than at the call site on purpose: the editor can
  // unmount while a take is still uploading (closing the note stops and keeps
  // the recording), and only callbacks declared on the mutation itself still
  // run to put the attachment in the cache.
  const uploadAudio = useMutation({
    mutationFn: ({ noteId, file }: { noteId: string; file: File }) => uploadAudioApi(noteId, file),
    onSuccess: (attachment, { noteId }) => {
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] }));
      void invalidateStorage();
    },
    onError: (err) => uploadFailedToast(err),
  });

  // Declared here for the same reason as the recording above: closing the note
  // must not cancel a document that is already on its way up.
  const uploadFile = useMutation({
    mutationFn: ({ noteId, file }: { noteId: string; file: File }) => uploadFileApi(noteId, file),
    onSuccess: (attachment, { noteId }) => {
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] }));
      void invalidateStorage();
    },
    onError: (err) => uploadFailedToast(err),
  });

  const uploadDrawing = useMutation({
    mutationFn: ({ noteId, file, drawing }: { noteId: string; file: File; drawing: DrawingData }) =>
      uploadDrawingApi(noteId, file, drawing),
    onSuccess: (attachment, { noteId }) => {
      setNote(noteId, (n) => ({ attachments: [...n.attachments, attachment] }));
      void invalidateStorage();
    },
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
    onSuccess: (attachment, { noteId }) => {
      setNote(noteId, (n) => ({
        attachments: n.attachments.map((a) => (a.id === attachment.id ? attachment : a)),
      }));
      void invalidateStorage();
    },
    onError: uploadFailedToast,
  });

  return { upload, uploadAudio, uploadFile, remove, uploadDrawing, updateDrawing };
}
