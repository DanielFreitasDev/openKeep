import { createHash } from 'node:crypto';
import type { NoteColor } from '@openkeep/shared';
import { LIMITS, TAKEOUT_COLOR_MAP } from '@openkeep/shared';

/** Google Takeout Keep JSON note (documented community schema). */
export interface TakeoutNote {
  title?: string;
  textContent?: string;
  textContentHtml?: string;
  listContent?: { text?: string; textHtml?: string; isChecked?: boolean }[];
  color?: string;
  isPinned?: boolean;
  isArchived?: boolean;
  isTrashed?: boolean;
  labels?: { name?: string }[];
  attachments?: { filePath?: string; mimetype?: string }[];
  annotations?: { source?: string; url?: string; title?: string }[];
  userEditedTimestampUsec?: number;
  createdTimestampUsec?: number;
}

export interface ParsedTakeoutNote {
  fingerprint: string;
  type: 'text' | 'list';
  title: string;
  bodyText: string;
  items: { text: string; checked: boolean }[];
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  labels: string[];
  attachmentPaths: { filePath: string; mimetype: string }[];
  createdAt: Date | null;
  editedAt: Date | null;
}

export function isKeepNoteEntry(fileName: string): boolean {
  return /(^|\/)Keep\/.+\.json$/i.test(fileName) || /^[^/]+\.json$/i.test(fileName);
}

/**
 * Parses one Takeout JSON payload into our import shape. Returns null for
 * payloads that are not Keep notes. The fingerprint is a stable hash of the
 * content → idempotent re-imports via the (owner_id, fingerprint) index.
 */
export function parseTakeoutNote(json: unknown): ParsedTakeoutNote | null {
  if (typeof json !== 'object' || json === null) return null;
  const note = json as TakeoutNote;
  const isList = Array.isArray(note.listContent);
  const hasText = typeof note.textContent === 'string' || typeof note.textContentHtml === 'string';
  if (!isList && !hasText && !note.title && !Array.isArray(note.attachments)) return null;

  const title = (note.title ?? '').slice(0, LIMITS.noteTitleMax);
  const bodyText = (note.textContent ?? '').slice(0, LIMITS.noteBodyTextMax);
  const items = (note.listContent ?? [])
    .filter((i) => typeof i.text === 'string')
    .slice(0, LIMITS.itemsPerNoteMax)
    .map((i) => ({
      text: (i.text ?? '').slice(0, LIMITS.itemTextMax),
      checked: i.isChecked === true,
    }));

  const labels = [
    ...new Set(
      (note.labels ?? [])
        .map((l) => (l.name ?? '').trim())
        .filter((n) => n.length > 0)
        .map((n) => n.slice(0, LIMITS.labelNameMax)),
    ),
  ];

  const color = TAKEOUT_COLOR_MAP[note.color ?? 'DEFAULT'] ?? 'default';

  const usecToDate = (usec: number | undefined): Date | null =>
    typeof usec === 'number' && usec > 0 ? new Date(Math.floor(usec / 1000)) : null;

  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        title,
        bodyText,
        items,
        created: note.createdTimestampUsec ?? 0,
      }),
    )
    .digest('hex');

  return {
    fingerprint,
    type: isList ? 'list' : 'text',
    title,
    bodyText,
    items,
    color,
    pinned: note.isPinned === true,
    archived: note.isArchived === true,
    trashed: note.isTrashed === true,
    labels,
    attachmentPaths: (note.attachments ?? [])
      .filter((a) => typeof a.filePath === 'string')
      .map((a) => ({ filePath: a.filePath ?? '', mimetype: a.mimetype ?? '' })),
    createdAt: usecToDate(note.createdTimestampUsec),
    editedAt: usecToDate(note.userEditedTimestampUsec),
  };
}
