import { z } from 'zod';
import { zId } from './common.js';

export const zApiToken = z.object({
  id: zId,
  name: z.string(),
  /** First 12 chars of the secret ("okp_AbCdEfGh") for display. */
  tokenPrefix: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
});
export type ApiToken = z.infer<typeof zApiToken>;

/** Create response only — the secret is shown once and never stored. */
export const zApiTokenWithSecret = zApiToken.extend({ token: z.string() });
export type ApiTokenWithSecret = z.infer<typeof zApiTokenWithSecret>;

export const zCreateApiToken = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
export type CreateApiToken = z.infer<typeof zCreateApiToken>;
