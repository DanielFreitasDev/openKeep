import type { OauthClient, OauthConnection } from '@openkeep/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { Auth, SessionUser } from '../../auth/auth.js';
import type { Db } from '../../db/client.js';
import { user } from '../../db/schema/auth.js';
import { oauthAccessToken, oauthApplication, oauthConsent } from '../../db/schema/oauth.js';
import { errors } from '../../lib/errors.js';

export interface OAuthGrant {
  user: SessionUser;
  /** The registered client the token was issued to. */
  clientId: string;
  /** Display name from dynamic client registration, for audit surfaces. */
  clientName: string;
  scopes: string[];
}

/**
 * Resolves an OAuth 2.1 bearer token to its user.
 *
 * Better Auth owns the lookup (`getMcpSession` checks the opaque token against
 * `oauth_access_token` and enforces expiry), so tokens stay revocable the
 * instant the row goes away. The user record is read here because the plugin
 * hands back the raw token row, not a session.
 *
 * A disabled client is treated as no credential at all: revoking a connector
 * should not wait for its access tokens to age out.
 */
export async function verifyOAuthToken(
  db: Db,
  auth: Auth,
  headers: Headers,
): Promise<OAuthGrant | null> {
  const granted = await auth.api.getMcpSession({ headers });
  if (!granted?.userId) return null;

  const [row] = await db
    .select({ account: user, client: oauthApplication })
    .from(user)
    .innerJoin(oauthApplication, eq(oauthApplication.clientId, granted.clientId))
    .where(eq(user.id, granted.userId))
    .limit(1);
  if (!row || row.client.disabled) return null;

  return {
    clientId: granted.clientId,
    clientName: row.client.name,
    scopes: granted.scopes ? granted.scopes.split(' ').filter(Boolean) : [],
    user: {
      id: row.account.id,
      email: row.account.email,
      name: row.account.name,
      image: row.account.image,
      emailVerified: row.account.emailVerified,
    },
  };
}

type ClientRow = typeof oauthApplication.$inferSelect;

/**
 * Only the hostnames, never the full redirect URLs: the host is what tells a
 * user whether "Claude" really is claude.ai, and a full URL invites a
 * registration whose path is a sentence of its own.
 */
function redirectHosts(row: ClientRow): string[] {
  const hosts = new Set<string>();
  for (const url of row.redirectUrls.split(',')) {
    try {
      hosts.add(new URL(url.trim()).host);
    } catch {
      // A malformed registration says nothing useful — leave it out.
    }
  }
  return [...hosts];
}

function toClientDto(row: ClientRow): OauthClient {
  return {
    clientId: row.clientId,
    name: row.name,
    icon: row.icon,
    redirectHosts: redirectHosts(row),
  };
}

/** Consent-screen lookup. 404 for unknown or disabled clients. */
export async function getClient(db: Db, clientId: string): Promise<OauthClient> {
  const [row] = await db
    .select()
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1);
  if (!row || row.disabled) throw errors.notFound();
  return toClientDto(row);
}

/** Connectors this user has authorized, newest first. */
export async function listConnections(db: Db, userId: string): Promise<OauthConnection[]> {
  const rows = await db
    .select({ client: oauthApplication, consent: oauthConsent })
    .from(oauthConsent)
    .innerJoin(oauthApplication, eq(oauthApplication.clientId, oauthConsent.clientId))
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.consentGiven, true)))
    .orderBy(desc(oauthConsent.createdAt));

  return rows.map((row) => ({
    ...toClientDto(row.client),
    grantedAt: row.consent.createdAt.toISOString(),
    scopes: row.consent.scopes.split(' ').filter(Boolean),
  }));
}

/**
 * Disconnects a connector: the consent goes, and so does every token issued
 * under it. Dropping the tokens is the part that actually ends access —
 * without it the connector keeps working for up to an hour.
 */
export async function revokeConnection(db: Db, userId: string, clientId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(oauthConsent)
      .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
      .returning({ id: oauthConsent.id });
    if (deleted.length === 0) throw errors.notFound();
    await tx
      .delete(oauthAccessToken)
      .where(and(eq(oauthAccessToken.userId, userId), eq(oauthAccessToken.clientId, clientId)));
  });
}
