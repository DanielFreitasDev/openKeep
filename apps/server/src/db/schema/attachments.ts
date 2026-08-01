import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { notes } from './notes.js';

/** Files on notes. Display order = created_at (Keep parity). */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    /** Opaque UUID storage keys (never user-controlled names). */
    storageKey: text().notNull(),
    thumbKey: text(),
    mime: text().notNull(),
    size: bigint({ mode: 'number' }).notNull(),
    width: integer(),
    height: integer(),
    /** Stroke vectors for kind='drawing' (the file is its PNG render); null otherwise. */
    drawingData: jsonb(),
    /**
     * Display name of a kind='file' attachment — what the chip shows and what
     * the download is named. Never a storage key: those stay opaque uuids.
     */
    filename: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Bumped when a drawing is re-saved — clients cache-bust file/thumb URLs with it. */
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('attachments_kind_check', sql`${t.kind} in ('image', 'audio', 'drawing', 'file')`),
    // A file is the only kind whose name is content: nothing else identifies it.
    check('attachments_filename_check', sql`(${t.kind} <> 'file') = (${t.filename} is null)`),
    index('attachments_note_idx').on(t.noteId, t.createdAt),
  ],
);

/**
 * Global link-preview cache keyed by sha256(normalized url). Image/favicon are
 * stored as URL strings — the browser loads them; the server never proxies.
 */
export const linkPreviews = pgTable(
  'link_previews',
  {
    urlHash: text().primaryKey(),
    url: text().notNull(),
    status: text().notNull().default('pending'),
    title: text(),
    description: text(),
    siteName: text(),
    faviconUrl: text(),
    imageUrl: text(),
    fetchedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    check('link_previews_status_check', sql`${t.status} in ('pending', 'ok', 'failed')`),
    index('link_previews_expires_idx').on(t.expiresAt),
  ],
);
