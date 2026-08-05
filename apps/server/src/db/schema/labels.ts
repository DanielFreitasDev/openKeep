import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
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

/**
 * Root of a nil uuid used to stand in for "no parent" in the sibling
 * uniqueness index: a plain unique index treats NULLs as distinct, which would
 * let an account hold two root labels with the same name.
 */
const NO_PARENT = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * Max 50 per account (enforced in the service transaction). Names are unique
 * *among siblings*, case-insensitively — `Work/Ideas` and `Personal/Ideas` are
 * two different labels, and the path is what identifies one account-wide.
 */
export const labels = pgTable(
  'labels',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    /**
     * Parent label, self-referencing. `null` is a root. The cascade is what
     * makes "delete a folder" delete its contents in one statement — and
     * note_labels cascades off labels in turn, so no note keeps a dangling
     * assignment to a label that went away with its ancestor.
     */
    parentId: uuid().references((): AnyPgColumn => labels.id, { onDelete: 'cascade' }),
    /** One of NOTE_COLORS; 'default' means "no colour", like a note. */
    color: text().notNull().default('default'),
    /** Optional grapheme shown before the name (chip, sidebar, pickers). */
    emoji: text(),
    /** Manual order among siblings (fractional). Ties fall back to the name. */
    position: positionText().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('labels_user_parent_lower_name_uq').on(
      t.userId,
      sql`coalesce(${t.parentId}, ${NO_PARENT})`,
      sql`lower(${t.name})`,
    ),
    index('labels_parent_idx').on(t.parentId),
    check('labels_name_len_check', sql`char_length(${t.name}) between 1 and 255`),
    // A stray paste must not turn a label into a paragraph; the picker offers
    // single graphemes, and some of those are several code points wide.
    check(
      'labels_emoji_len_check',
      sql`${t.emoji} is null or char_length(${t.emoji}) between 1 and 16`,
    ),
    // Cheap half of "no cycles": the expensive half (a label under its own
    // descendant) is an ancestry walk, and that lives in the service.
    check('labels_no_self_parent_check', sql`${t.parentId} is distinct from ${t.id}`),
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
