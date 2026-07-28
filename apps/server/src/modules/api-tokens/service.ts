import type { ApiToken, ApiTokenWithSecret, CreateApiToken } from '@openkeep/shared';
import { LIMITS } from '@openkeep/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import type { SessionUser } from '../../auth/auth.js';
import type { Db } from '../../db/client.js';
import { apiTokens } from '../../db/schema/api-tokens.js';
import { user } from '../../db/schema/auth.js';
import { errors } from '../../lib/errors.js';
import { generateToken, hashToken } from '../../lib/tokens.js';

type TokenRow = typeof apiTokens.$inferSelect;

/** last_used_at is display metadata — write at most once per window. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

function toDto(row: TokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export async function listTokens(db: Db, userId: string): Promise<ApiToken[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
  return rows.map(toDto);
}

export async function createToken(
  db: Db,
  userId: string,
  input: CreateApiToken,
): Promise<ApiTokenWithSecret> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ n: count() })
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId));
    if ((row?.n ?? 0) >= LIMITS.apiTokensPerUserMax) {
      throw errors.tokenLimitReached();
    }
    const { secret, hash, prefix } = generateToken();
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;
    const [created] = await tx
      .insert(apiTokens)
      .values({ userId, name: input.name, tokenHash: hash, tokenPrefix: prefix, expiresAt })
      .returning();
    return { ...toDto(created!), token: secret };
  });
}

export async function revokeToken(db: Db, userId: string, tokenId: string): Promise<void> {
  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });
  if (deleted.length === 0) throw errors.notFound();
}

/**
 * Resolves a PAT secret to its user (unique index on sha256 of the secret).
 * Returns null when unknown, revoked or expired.
 */
export async function verifyApiToken(
  db: Db,
  secret: string,
): Promise<{ user: SessionUser; tokenId: string } | null> {
  const [row] = await db
    .select({ token: apiTokens, account: user })
    .from(apiTokens)
    .innerJoin(user, eq(user.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(secret)))
    .limit(1);
  if (!row) return null;
  if (row.token.expiresAt && row.token.expiresAt.getTime() <= Date.now()) return null;

  const last = row.token.lastUsedAt;
  if (!last || Date.now() - last.getTime() > LAST_USED_THROTTLE_MS) {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.token.id));
  }

  return {
    tokenId: row.token.id,
    user: {
      id: row.account.id,
      email: row.account.email,
      name: row.account.name,
      image: row.account.image,
      emailVerified: row.account.emailVerified,
    },
  };
}
