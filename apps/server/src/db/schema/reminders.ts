import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';
import { notes } from './notes.js';

/** ONE reminder per (note, user) — Keep parity; per-user on shared notes. */
export const reminders = pgTable(
  'reminders',
  {
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Next occurrence; advanced by the fire job for recurring reminders. */
    remindAt: timestamp({ withTimezone: true }).notNull(),
    /** RFC-5545 RRULE body (e.g. FREQ=DAILY;INTERVAL=2); null = one-shot. */
    rrule: text(),
    /** Anchor for recurrence expansion. */
    dtstart: timestamp({ withTimezone: true }).notNull(),
    /** IANA zone — recurrence keeps wall-clock time across DST. */
    timezone: text().notNull(),
    snoozedUntil: timestamp({ withTimezone: true }),
    /** Cross-device toast dismissal for the current occurrence. */
    acknowledgedAt: timestamp({ withTimezone: true }),
    /** One-shot fired (kept for the struck-through chip). */
    done: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.userId] }),
    index('reminders_due_idx')
      .on(sql`coalesce(${t.snoozedUntil}, ${t.remindAt})`)
      .where(sql`not ${t.done}`),
    index('reminders_user_idx').on(t.userId),
  ],
);

/** Web Push subscriptions (one row per browser endpoint). */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);
