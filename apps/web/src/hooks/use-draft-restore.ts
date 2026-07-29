import type { FullNote, PatchNoteContent } from '@openkeep/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api.js';
import {
  clearAckedDraftFields,
  clearComposerDraft,
  clearDraftItems,
  listNoteDraftIds,
  readComposerDraft,
  readNoteDraft,
  removeNoteDraft,
} from '../lib/drafts.js';
import { createItemApi, patchItemApi } from '../lib/items-api.js';
import { mergeNote } from '../lib/note-selectors.js';
import { notesQuery } from '../lib/notes-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';
import { useCollaboratorMutations } from './use-collaborator-mutations.js';
import { useLabelMutations } from './use-label-mutations.js';
import { useNoteMutations } from './use-note-mutations.js';
import { useIsOnline } from './use-online.js';
import { useReminderMutations } from './use-reminder-mutations.js';

// Once per page load (survives StrictMode remounts).
let painted = false;
let resubmitted = false;
/** Server field values captured before painting drafts over the cache. */
const prePaint = new Map<string, { title: string; bodyHtml: string }>();

const CONTENT_FIELDS = ['title', 'bodyHtml'] as const;

/**
 * Boot-time draft recovery, two phases:
 * 1. Paint — merge surviving drafts over the cached corpus so the user sees
 *    their text immediately (works offline over the SW-cached corpus).
 * 2. Resubmit — once online, re-send whatever the server never acked and
 *    recreate a composer note that never landed (409 = it did; finish up).
 * Acks clear the mirrors; a draft older than the server copy is dropped (the
 * same field-level LWW the app applies to live collaborator edits).
 */
export function useDraftRestore() {
  const queryClient = useQueryClient();
  const { isSuccess } = useQuery(notesQuery);
  const online = useIsOnline();
  const m = useNoteMutations();
  const labelM = useLabelMutations();
  const reminderM = useReminderMutations();
  const collaboratorM = useCollaboratorMutations();
  const show = useSnackbarStore((s) => s.show);
  const { t } = useTranslation('common');

  useEffect(() => {
    if (!isSuccess || painted) return;
    painted = true;
    const list = queryClient.getQueryData(notesQuery.queryKey);
    if (!list) return;
    for (const id of listNoteDraftIds()) {
      const draft = readNoteDraft(id);
      const note = list.find((n) => n.id === id);
      if (!draft || !note || note.trashedAt) continue;
      const serverAt = Date.parse(note.updatedAt);
      const patch: Record<string, unknown> = {};
      for (const field of CONTENT_FIELDS) {
        const entry = draft.fields[field];
        if (entry && entry.at > serverAt && entry.value !== note[field]) patch[field] = entry.value;
      }
      if (draft.items && draft.items.at > serverAt && note.type === 'list') {
        // Uncreated rows borrow their client key as a provisional item id.
        patch.items = draft.items.rows.map((r) => ({
          id: r.id ?? r.key,
          text: r.text,
          checked: r.checked,
          indent: r.indent,
          position: r.position,
        }));
      }
      if (Object.keys(patch).length > 0) {
        prePaint.set(id, { title: note.title, bodyHtml: note.bodyHtml });
        queryClient.setQueryData(notesQuery.queryKey, (old: FullNote[] | undefined) =>
          mergeNote(old, id, patch),
        );
      }
    }
  }, [isSuccess, queryClient]);

  useEffect(() => {
    if (!isSuccess || !online || resubmitted) return;
    resubmitted = true;
    const list = queryClient.getQueryData(notesQuery.queryKey);
    if (!list) return;
    let restoring = false;

    // Fields already inside a queued (outbox) content patch need no resend.
    const queuedFields = new Map<string, Set<string>>();
    for (const mu of queryClient.getMutationCache().getAll()) {
      if (mu.state.status !== 'pending') continue;
      const key = mu.options.mutationKey;
      if (!Array.isArray(key) || key[1] !== 'patchContent') continue;
      const vars = mu.state.variables as { id?: string; patch?: PatchNoteContent } | undefined;
      if (!vars?.id || !vars.patch) continue;
      const fields = queuedFields.get(vars.id) ?? new Set<string>();
      for (const field of Object.keys(vars.patch)) fields.add(field);
      queuedFields.set(vars.id, fields);
    }

    for (const id of listNoteDraftIds()) {
      const draft = readNoteDraft(id);
      if (!draft) continue;
      const note = list.find((n) => n.id === id);
      if (!note || note.trashedAt) {
        removeNoteDraft(id);
        continue;
      }
      const serverAt = Date.parse(note.updatedAt);
      const server = prePaint.get(id);

      const patch: PatchNoteContent = {};
      for (const field of CONTENT_FIELDS) {
        const entry = draft.fields[field];
        if (!entry) continue;
        const serverValue = server ? server[field] : note[field];
        if (entry.at <= serverAt || entry.value === serverValue) {
          // Acked meanwhile, or superseded by a newer remote edit — drop it.
          clearAckedDraftFields(id, { [field]: entry.value }, entry.at);
        } else if (!queuedFields.get(id)?.has(field)) {
          patch[field] = entry.value;
        }
      }
      if (Object.keys(patch).length > 0) {
        m.patchContent.mutate({ id, patch });
        restoring = true;
      }

      if (draft.items) {
        if (draft.items.at <= serverAt || note.type !== 'list') {
          clearDraftItems(id);
        } else {
          restoring = true;
          const ops = draft.items.rows.map((row) =>
            row.id
              ? patchItemApi(id, row.id, {
                  text: row.text,
                  checked: row.checked,
                  indent: row.indent,
                  position: row.position,
                }).catch((err: unknown) => {
                  // A remotely deleted row is gone for good — not a failure.
                  if (err instanceof ApiError && err.status === 404) return null;
                  throw err;
                })
              : row.text.trim() === ''
                ? Promise.resolve(null)
                : createItemApi(id, {
                    text: row.text,
                    checked: row.checked,
                    indent: row.indent,
                    position: row.position,
                  }),
          );
          void Promise.allSettled(ops).then((results) => {
            if (results.every((r) => r.status === 'fulfilled')) {
              clearDraftItems(id);
              void queryClient.invalidateQueries({ queryKey: notesQuery.queryKey });
            }
          });
        }
      }
    }

    const composer = readComposerDraft();
    if (composer) {
      const applyExtras = () => {
        for (const labelId of composer.labelIds)
          labelM.setNoteLabel.mutate({ noteId: composer.note.id, labelId, on: true });
        if (composer.reminder)
          reminderM.set.mutate({ noteId: composer.note.id, body: composer.reminder });
        for (const email of composer.invites)
          collaboratorM.invite.mutate({ noteId: composer.note.id, email });
        clearComposerDraft();
      };
      if (list.some((n) => n.id === composer.note.id)) {
        applyExtras();
      } else {
        restoring = true;
        m.create
          .mutateAsync(composer.note)
          .then(applyExtras)
          .catch((err: unknown) => {
            // 409: the create landed before the reload — just finish the job.
            if (err instanceof ApiError && err.status === 409) applyExtras();
            // Anything else keeps the draft for the next boot; onError toasted.
          });
      }
    }

    if (restoring) show({ message: t('restoringUnsaved') });
  }, [isSuccess, online, queryClient, m, labelM, reminderM, collaboratorM, show, t]);
}
