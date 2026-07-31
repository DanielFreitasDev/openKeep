import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { notes } from './notes.js';

/**
 * A note's public read-only link. One row per note (the note id IS the primary
 * key): the UI is a switch, not a list, so re-issuing replaces the row and the
 * old address stops resolving. The token is stored in the clear because the
 * URL is the credential and has to stay copyable from any device — revoking is
 * deleting the row, which every holder feels at once.
 */
export const noteShareLinks = pgTable('note_share_links', {
  noteId: uuid()
    .primaryKey()
    .references(() => notes.id, { onDelete: 'cascade' }),
  token: text().notNull().unique(),
  createdBy: text()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** Null = lives until revoked. */
  expiresAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
