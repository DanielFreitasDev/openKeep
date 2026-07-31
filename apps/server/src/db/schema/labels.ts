import { sql } from 'drizzle-orm';
import {
  check,
  customType,
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

/** Same bytewise-comparing text the note positions use. */
const positionText = customType<{ data: string }>({
  dataType() {
    return 'text COLLATE "C"';
  },
});

/** Max 50 per account (enforced in the service transaction); unique per user, case-insensitive. */
export const labels = pgTable(
  'labels',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /** One of NOTE_COLORS; 'default' means "no colour", like a note. */
    color: text().notNull().default('default'),
    /** Optional grapheme shown before the name (chip, sidebar, pickers). */
    emoji: text(),
    /** Manual sidebar order (fractional). Ties fall back to the name. */
    position: positionText().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('labels_user_lower_name_uq').on(t.userId, sql`lower(${t.name})`),
    check('labels_name_len_check', sql`char_length(${t.name}) between 1 and 255`),
    // A stray paste must not turn a label into a paragraph; the picker offers
    // single graphemes, and some of those are several code points wide.
    check(
      'labels_emoji_len_check',
      sql`${t.emoji} is null or char_length(${t.emoji}) between 1 and 16`,
    ),
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
