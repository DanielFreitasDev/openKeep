import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Fractional-index positions compare bytewise. */
const positionText = customType<{ data: string }>({
  dataType() {
    return 'text COLLATE "C"';
  },
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

const NOTE_COLORS_SQL =
  "('default','coral','peach','sand','mint','sage','fog','storm','dusk','blossom','clay','chalk')";
const NOTE_BACKGROUNDS_SQL =
  "('none','groceries','food','music','recipes','notes','places','travel','video','celebration')";

/**
 * Shared note content. Everything per-user (pin/archive/color/background/
 * order) lives on note_members — the single authz + display-state chokepoint.
 */
export const notes = pgTable(
  'notes',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text().notNull().default('text'),
    title: text().notNull().default(''),
    /** Sanitized allowlist html (h1,h2,p,br,strong,em,u — zero attributes). */
    bodyHtml: text().notNull().default(''),
    /** Server-derived plain text: drives FTS and .txt export. */
    bodyText: text().notNull().default(''),
    hasLinks: boolean().notNull().default(false),
    /** Owner-scoped soft delete (7-day retention). */
    trashedAt: timestamp({ withTimezone: true }),
    lastEditedBy: text().references(() => user.id, { onDelete: 'set null' }),
    /** Takeout import idempotency. */
    importedFingerprint: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    searchTsv: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('openkeep', coalesce(title, '')), 'A') || setweight(to_tsvector('openkeep', coalesce(body_text, '')), 'B')`,
    ),
  },
  (t) => [
    check('notes_type_check', sql`${t.type} in ('text', 'list')`),
    check('notes_title_len_check', sql`char_length(${t.title}) <= 1000`),
    check('notes_body_text_len_check', sql`char_length(${t.bodyText}) <= 20000`),
    check('notes_body_html_len_check', sql`char_length(${t.bodyHtml}) <= 100000`),
    index('notes_owner_idx').on(t.ownerId),
    index('notes_trashed_idx').on(t.trashedAt).where(sql`${t.trashedAt} is not null`),
    uniqueIndex('notes_owner_fingerprint_uq')
      .on(t.ownerId, t.importedFingerprint)
      .where(sql`${t.importedFingerprint} is not null`),
    index('notes_search_idx').using('gin', t.searchTsv),
  ],
);

/**
 * Membership AND all per-user state in one row. The owner has a row too
 * (role='owner'); a partial unique index guarantees exactly one owner.
 */
export const noteMembers = pgTable(
  'note_members',
  {
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** viewer < collaborator (= editor) < owner; see zNoteRole in shared. */
    role: text().notNull().default('owner'),
    pinned: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),
    /** A template is a bucket of my board, like the archive — never shared state. */
    isTemplate: boolean().notNull().default(false),
    color: text().notNull().default('default'),
    background: text().notNull().default('none'),
    position: positionText().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.userId] }),
    uniqueIndex('note_members_one_owner_uq').on(t.noteId).where(sql`role = 'owner'`),
    index('note_members_user_idx').on(t.userId),
    check('note_members_role_check', sql`${t.role} in ('owner', 'collaborator', 'viewer')`),
    check('note_members_color_check', sql.raw(`color in ${NOTE_COLORS_SQL}`)),
    check('note_members_background_check', sql.raw(`background in ${NOTE_BACKGROUNDS_SQL}`)),
  ],
);

/** Checklist items — item-level rows keep the collab conflict surface minimal. */
export const noteItems = pgTable(
  'note_items',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    text: text().notNull().default(''),
    checked: boolean().notNull().default(false),
    /** One indent level, Keep parity (0 | 1). */
    indent: integer().notNull().default(0),
    position: positionText().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    searchTsv: tsvector().generatedAlwaysAs(
      sql`setweight(to_tsvector('openkeep', coalesce(text, '')), 'B')`,
    ),
  },
  (t) => [
    check('note_items_text_len_check', sql`char_length(${t.text}) <= 1000`),
    check('note_items_indent_check', sql`${t.indent} in (0, 1)`),
    index('note_items_note_idx').on(t.noteId),
    index('note_items_search_idx').using('gin', t.searchTsv),
  ],
);

export interface VersionItem {
  text: string;
  checked: boolean;
  indent: number;
}

/** Immutable text snapshots, captured at editing-session boundaries. */
export const noteVersions = pgTable(
  'note_versions',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    title: text().notNull().default(''),
    bodyText: text().notNull().default(''),
    /** For list notes: [{text, checked, indent}]; null for text notes. */
    items: jsonb().$type<VersionItem[] | null>(),
    createdBy: text().references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('note_versions_note_idx').on(t.noteId, t.createdAt)],
);
