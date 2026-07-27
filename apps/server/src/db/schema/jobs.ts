import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Long-running per-user jobs (Takeout import, data export). */
export const userJobs = pgTable(
  'user_jobs',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    status: text().notNull().default('pending'),
    progress: integer().notNull().default(0),
    total: integer().notNull().default(0),
    /** Uploaded zip (import) or produced zip (export) in the exports area. */
    fileKey: text(),
    error: text(),
    /** Import summary / export metadata. */
    summary: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    check('user_jobs_kind_check', sql`${t.kind} in ('import', 'export')`),
    check('user_jobs_status_check', sql`${t.status} in ('pending', 'running', 'done', 'failed')`),
    index('user_jobs_user_idx').on(t.userId, t.createdAt),
  ],
);
