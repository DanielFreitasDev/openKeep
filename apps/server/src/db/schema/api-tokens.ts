import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Personal access tokens (MCP / API). Secret stored as sha256 only. */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid().primaryKey().default(sql`uuidv7()`),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    tokenHash: text().notNull(),
    /** First 12 chars of the secret, for display ("okp_AbCd…"). */
    tokenPrefix: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('api_tokens_hash_idx').on(t.tokenHash),
    index('api_tokens_user_idx').on(t.userId, t.createdAt),
  ],
);
