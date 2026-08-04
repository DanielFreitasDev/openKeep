import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/**
 * Better Auth `mcp` plugin tables (it re-exports the `oidc-provider` schema).
 * Shapes match that plugin's field declarations exactly — property names are
 * the contract, since the Drizzle adapter looks fields up by name; column
 * names come from drizzle-kit's snake_case casing like every other table.
 *
 * Access tokens are opaque and stored here rather than signed JWTs, so a
 * revoked authorization stops working on the next request — the same
 * immediate-revocation property the `okp_` tokens have.
 */

export const oauthApplication = pgTable(
  'oauth_application',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    icon: text(),
    metadata: text(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    redirectUrls: text().notNull(),
    type: text().notNull(),
    disabled: boolean().notNull().default(false),
    userId: text().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('oauth_application_user_id_idx').on(t.userId)],
);

export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    id: text().primaryKey(),
    accessToken: text().notNull().unique(),
    refreshToken: text().notNull().unique(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }).notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
    userId: text().references(() => user.id, { onDelete: 'cascade' }),
    scopes: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('oauth_access_token_client_id_idx').on(t.clientId),
    index('oauth_access_token_user_id_idx').on(t.userId),
  ],
);

export const oauthConsent = pgTable(
  'oauth_consent',
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    scopes: text().notNull(),
    consentGiven: boolean().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('oauth_consent_client_id_idx').on(t.clientId),
    index('oauth_consent_user_id_idx').on(t.userId),
  ],
);
