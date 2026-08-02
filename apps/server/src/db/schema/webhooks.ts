import type { WebhookEvent } from '@openkeep/shared';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/**
 * Outgoing webhooks: one row per endpoint a user asked us to POST to.
 *
 * `secret` is stored in the clear, unlike an API token's hash, and that is not
 * an oversight — we have to reproduce the key on every delivery to sign the
 * body. It also grants nothing here: it lets the receiver prove a request came
 * from us, so its blast radius is the receiver's, not this account's.
 */
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    url: text().notNull(),
    /** Subscribed event names (the shared WEBHOOK_EVENTS vocabulary). */
    events: text().array().notNull().$type<WebhookEvent[]>(),
    enabled: boolean().notNull().default(true),
    secret: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Last attempt only — this is a status line, not a delivery log. */
    lastDeliveryAt: timestamp({ withTimezone: true }),
    lastStatus: integer(),
    lastError: text(),
  },
  (t) => [index('webhooks_user_idx').on(t.userId, t.createdAt)],
);
