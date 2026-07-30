import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAttachmentMutations } from './use-attachment-mutations.js';
import { useLabelMutations } from './use-label-mutations.js';
import { useNoteMutations } from './use-note-mutations.js';

/**
 * Create an empty note optimistically and open it in the full-screen editor.
 * Shared by the mobile FAB and the app shortcuts (`?compose=`) so both entry
 * points produce exactly the same note.
 */
export function useCreateAndOpenNote() {
  const navigate = useNavigate();
  const m = useNoteMutations();
  const labelM = useLabelMutations();
  const attachmentM = useAttachmentMutations();

  return useCallback(
    (type: 'text' | 'list', opts?: { labelId?: string; file?: File }) => {
      const id = m.newNoteId();
      m.create.mutate({
        id,
        type,
        title: '',
        bodyHtml: '',
        items: [],
        pinned: false,
        color: 'default',
        background: 'none',
      });
      if (opts?.labelId)
        labelM.setNoteLabel.mutate({ noteId: id, labelId: opts.labelId, on: true });
      if (opts?.file) attachmentM.upload.mutate({ noteId: id, file: opts.file });
      void navigate({
        to: '.',
        // A note born from a picked image is intentional — never discard it, or
        // the empty-note check could race the still-uploading attachment.
        search: (old: Record<string, unknown>) => ({
          ...old,
          note: id,
          new: opts?.file ? undefined : true,
          compose: undefined,
        }),
        resetScroll: false,
      });
      return id;
    },
    [navigate, m, labelM, attachmentM],
  );
}
