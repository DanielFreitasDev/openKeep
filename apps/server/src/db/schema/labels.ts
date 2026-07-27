import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { noteMembers } from './notes.js';

/** Max 50 per account (enforced in the service transaction); unique per user, case-insensitive. */
export const labels = pgTable(
  'labels',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('labels_user_lower_name_uq').on(t.userId, sql`lower(${t.name})`),
    check('labels_name_len_check', sql`char_length(${t.name}) between 1 and 225`),
  ],
);

/**
 * Per-user note↔label assignment. The composite FK onto note_members means
 * leaving (or being removed from) a note auto-clears your labels on it.
 */
export const noteLabels = pgTable(
  'note_labels',
  {
    noteId: uuid().notNull(),
    userId: text().notNull(),
    labelId: uuid()
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.userId, t.labelId] }),
    foreignKey({
      columns: [t.noteId, t.userId],
      foreignColumns: [noteMembers.noteId, noteMembers.userId],
      name: 'note_labels_membership_fk',
    }).onDelete('cascade'),
    index('note_labels_label_idx').on(t.labelId),
    index('note_labels_user_idx').on(t.userId),
  ],
);
