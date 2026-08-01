import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Instance-wide policy the owner can flip at runtime — one row, always.
 *
 * Everything else about who administers the instance lives in the env
 * (`ADMIN_EMAILS`), on purpose: an admin flag in a table is a privilege an
 * attacker with SQL can grant themselves, and it needs a bootstrap answer for
 * the empty database. What *does* need a row is state the panel writes, and so
 * far that is exactly one switch. Missing row = the defaults below.
 */
export const instanceSettings = pgTable(
  'instance_settings',
  {
    id: text().primaryKey().default('singleton'),
    /** Off closes public sign-up (email and OAuth alike) to new users. */
    signupEnabled: boolean().notNull().default(true),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check('instance_settings_singleton_check', sql`${t.id} = 'singleton'`)],
);
