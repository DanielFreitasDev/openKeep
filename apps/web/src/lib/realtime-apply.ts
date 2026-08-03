import type { FullNote, UserSettings, WsEnvelope, WsEvent } from '@openkeep/shared';
import type { QueryClient } from '@tanstack/react-query';
import { labelsQuery } from './labels-api.js';
import { mergeNote, removeNote, upsertNote } from './note-selectors.js';
import { notesQuery } from './notes-api.js';
import { refreshProtectedViews } from './protection-api.js';
import { sessionQuery, settingsQuery } from './queries.js';

type Handler = (queryClient: QueryClient, payload: never) => boolean | undefined;

function mergeIfKnown(
  queryClient: QueryClient,
  noteId: string,
  patch: Partial<FullNote> | ((n: FullNote) => Partial<FullNote>),
): boolean {
  const list = queryClient.getQueryData(notesQuery.queryKey);
  const note = list?.find((n) => n.id === noteId);
  if (!list || !note) return false; // unknown note → caller invalidates
  const resolved = typeof patch === 'function' ? patch(note) : patch;
  queryClient.setQueryData(notesQuery.queryKey, mergeNote(list, noteId, resolved));
  return true;
}

/**
 * Patch-always cache application in server commit order. Returns false when
 * the event references an entity we don't have → corpus refetch.
 */
const HANDLERS: { [T in WsEvent as T['type']]: (qc: QueryClient, p: T['payload']) => boolean } = {
  'note.added': (qc, p) => {
    qc.setQueryData(notesQuery.queryKey, (old) => upsertNote(old, p.note));
    return true;
  },
  'note.updated': (qc, p) =>
    mergeIfKnown(qc, p.id, {
      title: p.title,
      bodyHtml: p.bodyHtml,
      hasLinks: p.hasLinks,
      updatedAt: p.updatedAt,
    }),
  'note.trashed': (qc, p) => mergeIfKnown(qc, p.id, { trashedAt: p.trashedAt, pinned: false }),
  'note.restored': (qc, p) => mergeIfKnown(qc, p.id, { trashedAt: null }),
  'note.removed': (qc, p) => {
    qc.setQueryData(notesQuery.queryKey, (old) => removeNote(old, p.id));
    return true;
  },
  // "Delete all notes" from another tab: the corpus is empty, not patched —
  // and the labels went with it, so the sidebar empties in the same beat.
  'notes.purged': (qc) => {
    qc.setQueryData(notesQuery.queryKey, []);
    qc.setQueryData(labelsQuery.queryKey, []);
    return true;
  },
  'note.state_changed': (qc, p) =>
    mergeIfKnown(qc, p.id, {
      pinned: p.pinned,
      archived: p.archived,
      isTemplate: p.isTemplate,
      color: p.color,
      background: p.background,
      position: p.position,
    }),
  'note.labels_changed': (qc, p) => mergeIfKnown(qc, p.id, { labelIds: p.labelIds }),
  // Another tab of mine protected (or released) the note. The flag can be
  // patched in, but the CONTENT cannot: a note that just became protected is
  // holding words this tab was sent before the curtain came down, and a note
  // that was just released is holding none. Either way the corpus is now
  // wrong, so this one refetches instead of patching.
  'note.lock_changed': (qc, p) => {
    mergeIfKnown(qc, p.id, { locked: p.locked });
    void refreshProtectedViews(qc);
    return true;
  },
  'note.converted': (qc, p) =>
    // Merge SHARED content only — per-user fields in the payload belong to the actor.
    mergeIfKnown(qc, p.note.id, {
      type: p.note.type,
      title: p.note.title,
      bodyHtml: p.note.bodyHtml,
      hasLinks: p.note.hasLinks,
      items: p.note.items,
      updatedAt: p.note.updatedAt,
    }),
  'item.added': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      items: n.items.some((i) => i.id === p.item.id) ? n.items : [...n.items, p.item],
    })),
  'item.updated': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      items: n.items.map((i) => {
        if (i.id === p.item.id) return p.item;
        const cascaded = p.cascaded.find((c) => c.id === i.id);
        return cascaded ?? i;
      }),
    })),
  'item.removed': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({ items: n.items.filter((i) => i.id !== p.itemId) })),
  'items.replaced': (qc, p) => mergeIfKnown(qc, p.noteId, { items: p.items }),
  'label.created': (qc, p) => {
    qc.setQueryData(labelsQuery.queryKey, (old) =>
      old
        ? [...old.filter((l) => l.id !== p.label.id), p.label].sort((a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
          )
        : old,
    );
    return true;
  },
  'label.renamed': (qc, p) => {
    qc.setQueryData(labelsQuery.queryKey, (old) =>
      old?.map((l) => (l.id === p.label.id ? p.label : l)),
    );
    return true;
  },
  'label.deleted': (qc, p) => {
    qc.setQueryData(labelsQuery.queryKey, (old) => old?.filter((l) => l.id !== p.labelId));
    qc.setQueryData(notesQuery.queryKey, (old) =>
      old?.map((n) =>
        n.labelIds.includes(p.labelId)
          ? { ...n, labelIds: n.labelIds.filter((x) => x !== p.labelId) }
          : n,
      ),
    );
    return true;
  },
  'reminder.set': (qc, p) => mergeIfKnown(qc, p.noteId, { reminder: p.reminder }),
  'reminder.deleted': (qc, p) => mergeIfKnown(qc, p.noteId, { reminder: null }),
  'reminder.fired': () => true, // toast handled by the listener in use-realtime
  'reminder.dismissed': () => true,
  'attachment.added': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      attachments: n.attachments.some((a) => a.id === p.attachment.id)
        ? n.attachments
        : [...n.attachments, p.attachment],
    })),
  'attachment.updated': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      attachments: n.attachments.map((a) => (a.id === p.attachment.id ? p.attachment : a)),
    })),
  'attachment.removed': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      attachments: n.attachments.filter((a) => a.id !== p.attachmentId),
    })),
  'collaborator.added': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      collaborators: n.collaborators.some((c) => c.userId === p.collaborator.userId)
        ? n.collaborators
        : [...n.collaborators, p.collaborator],
    })),
  'collaborator.removed': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => ({
      collaborators: n.collaborators.filter((c) => c.userId !== p.userId),
    })),
  'collaborator.role_changed': (qc, p) =>
    mergeIfKnown(qc, p.noteId, (n) => {
      const meId = qc.getQueryData(sessionQuery.queryKey)?.user.id;
      return {
        collaborators: n.collaborators.map((c) =>
          c.userId === p.userId ? { ...c, role: p.role } : c,
        ),
        // `role` on the note is MY level — the one the UI reads to go
        // read-only — so it only moves when the change is about me.
        ...(p.userId === meId ? { role: p.role } : {}),
      };
    }),
  'settings.updated': (qc, p) => {
    qc.setQueryData(settingsQuery.queryKey, (old): UserSettings | undefined =>
      old ? { ...old, ...p } : undefined,
    );
    return true;
  },
  'job.progress': (qc, p) => {
    qc.setQueryData<{ status: string; progress: number; total: number }>(['job', p.jobId], (old) =>
      old ? { ...old, status: 'running', progress: p.progress, total: p.total } : old,
    );
    return true;
  },
  'job.completed': (qc, p) => {
    void qc.invalidateQueries({ queryKey: ['job', p.jobId] });
    if (p.kind === 'import') {
      // Imported notes/labels should appear without waiting for the dialog poll.
      void qc.invalidateQueries({ queryKey: notesQuery.queryKey });
      void qc.invalidateQueries({ queryKey: labelsQuery.queryKey });
    }
    return true;
  },
  'job.failed': (qc, p) => {
    void qc.invalidateQueries({ queryKey: ['job', p.jobId] });
    return true;
  },
  'link_preview.resolved': (qc, p) => {
    void qc.invalidateQueries({ queryKey: ['linkPreview', p.url] });
    return true;
  },
};

/** Returns true when fully applied; false → the caller should refetch the corpus. */
export function applyWsEvent(queryClient: QueryClient, envelope: WsEnvelope): boolean {
  const handler = HANDLERS[envelope.type] as Handler | undefined;
  if (!handler) return true;
  return handler(queryClient, envelope.payload as never) !== false;
}
