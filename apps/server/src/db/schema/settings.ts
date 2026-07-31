import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

// Inlined as a literal (sql.raw) — parameters are illegal in CHECK constraints.
const TIME_RE = sql.raw(`'^([01][0-9]|2[0-3]):[0-5][0-9]$'`);

/**
 * Keep's Settings dialog toggles + reminder default times + client prefs.
 * Seeded by the Better Auth user-create hook (with a defensive upsert on read).
 */
export const userSettings = pgTable(
  'user_settings',
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Add new items to the bottom (Keep default: on). */
    addItemsToBottom: boolean().notNull().default(true),
    /** Move checked items to bottom of list (Keep default: on). */
    moveCheckedToBottom: boolean().notNull().default(true),
    /** Display rich link previews (Keep default: on). */
    richLinkPreviews: boolean().notNull().default(true),
    /** Enable sharing — off blocks inbound shares to this user. */
    sharingEnabled: boolean().notNull().default(true),
    /** Reminder defaults, HH:MM local time. */
    reminderMorning: text().notNull().default('08:00'),
    reminderAfternoon: text().notNull().default('13:00'),
    reminderEvening: text().notNull().default('18:00'),
    /** IANA timezone for reminder expansion; null = ask client/UTC. */
    timezone: text(),
    /** grid | list — mirrored from the client so it roams across devices. */
    viewMode: text().notNull().default('grid'),
    /** Grid order: manual (the fractional position) or a client-side view of it. */
    noteSort: text().notNull().default('manual'),
    /**
     * Secret in the iCalendar feed URL. Null = no feed; rotating it revokes
     * every subscription at once. Not part of the settings DTO — a bearer
     * secret has no business in a body the client can PATCH.
     */
    calendarToken: text().unique(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check('user_settings_view_mode_check', sql`${t.viewMode} in ('grid', 'list')`),
    check(
      'user_settings_note_sort_check',
      sql`${t.noteSort} in ('manual', 'edited', 'created', 'title')`,
    ),
    check(
      'user_settings_times_check',
      sql`${t.reminderMorning} ~ ${TIME_RE} and ${t.reminderAfternoon} ~ ${TIME_RE} and ${t.reminderEvening} ~ ${TIME_RE}`,
    ),
  ],
);
