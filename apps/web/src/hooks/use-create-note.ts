import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAttachmentMutations } from './use-attachment-mutations.js';
import { useLabelMutations } from './use-label-mutations.js';
import { useNoteMutations } from './use-note-mutations.js';

interface CreateOpts {
  labelId?: string;
  files?: File[];
  title?: string;
  bodyHtml?: string;
  /** Route to land on; defaults to the current one. The share target leaves `/share`. */
  to?: string;
  replace?: boolean;
}

/**
 * Create a note optimistically and open it in the full-screen editor.
 * Shared by the mobile FAB, the app shortcuts (`?compose=`) and the share
 * target (`/share`) so every entry point produces exactly the same note.
 */
export function useCreateAndOpenNote() {
  const navigate = useNavigate();
  const m = useNoteMutations();
  const labelM = useLabelMutations();
  const attachmentM = useAttachmentMutations();

  return useCallback(
    (type: 'text' | 'list', opts?: CreateOpts) => {
      const id = m.newNoteId();
      const files = opts?.files ?? [];
      const title = opts?.title ?? '';
      const bodyHtml = opts?.bodyHtml ?? '';
      const created = m.create
        .mutateAsync({
          id,
          type,
          title,
          bodyHtml,
          items: [],
          pinned: false,
          color: 'default',
          background: 'none',
        })
        // The mutation's registered onError already toasts and offers the
        // retry; this only keeps the rejection from escaping as an unhandled
        // one, since nothing here awaits the result.
        .catch(() => null);
      if (opts?.labelId)
        labelM.setNoteLabel.mutate({ noteId: id, labelId: opts.labelId, on: true });
      // Uploads wait for the create to land: the attachment endpoint is scoped
      // to a note that does not exist yet, and offline the create is a paused
      // outbox entry — this keeps the file queued behind it instead of failing.
      if (files.length > 0)
        void created.then((note) => {
          if (!note) return;
          for (const file of files) attachmentM.upload.mutate({ noteId: id, file });
        });
      // A note born with content is intentional — never mark it `new` (which
      // discards it on close), or the empty-note check could race a
      // still-uploading attachment or throw away what was shared in.
      const bornEmpty = files.length === 0 && title === '' && bodyHtml === '';
      void navigate({
        to: opts?.to ?? '.',
        search: (old: Record<string, unknown>) => ({
          ...old,
          note: id,
          new: bornEmpty ? true : undefined,
          compose: undefined,
        }),
        replace: opts?.replace,
        resetScroll: false,
      });
      return id;
    },
    [navigate, m, labelM, attachmentM],
  );
}
