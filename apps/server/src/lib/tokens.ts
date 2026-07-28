import { createHash, randomBytes } from 'node:crypto';

/**
 * PAT secrets: `okp_` + 43 chars of base64url (256 bits of entropy).
 * Lookup is by unique index on the sha256 of the full secret; with a
 * 256-bit random secret the hash comparison is not attacker-controllable
 * timing-wise, so timingSafeEqual is unnecessary.
 */
export function hashToken(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateToken(): { secret: string; hash: string; prefix: string } {
  const secret = `okp_${randomBytes(32).toString('base64url')}`;
  return { secret, hash: hashToken(secret), prefix: secret.slice(0, 12) };
}
