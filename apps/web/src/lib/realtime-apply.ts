import type { FullNote, UserSettings, WsEnvelope, WsEvent } from '@openkeep/shared';
import type { QueryClient } from '@tanstack/react-query';
import { labelsQuery } from './labels-api.js';
import { mergeNote, removeNote, upsertNote } from './note-selectors.js';
import { notesQuery } from './notes-api.js';
import { settingsQuery } from './queries.js';

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
  'note.state_changed': (qc, p) =>
    mergeIfKnown(qc, p.id, {
      pinned: p.pinned,
      archived: p.archived,
      color: p.color,
      background: p.background,
      position: p.position,
    }),
  'note.labels_changed': (qc, p) => mergeIfKnown(qc, p.id, { labelIds: p.labelIds }),
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
  'settings.updated': (qc, p) => {
    qc.setQueryData(settingsQuery.queryKey, (old): UserSettings | undefined =>
      old ? { ...old, ...p } : undefined,
    );
    return true;
  },
};

/** Returns true when fully applied; false → the caller should refetch the corpus. */
export function applyWsEvent(queryClient: QueryClient, envelope: WsEnvelope): boolean {
  const handler = HANDLERS[envelope.type] as Handler | undefined;
  if (!handler) return true;
  return handler(queryClient, envelope.payload as never) !== false;
}
