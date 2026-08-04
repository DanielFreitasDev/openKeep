import { z } from 'zod';

/** Client ids come from dynamic registration, not our id generator. */
export const zOauthClientId = z.string().min(1).max(100);

/**
 * What the consent screen shows about the app asking for access. Everything
 * here was self-declared at registration time, so the UI has to present it as
 * a claim rather than a fact.
 */
export const zOauthClient = z.object({
  clientId: zOauthClientId,
  name: z.string(),
  icon: z.string().nullable(),
  /** Where the code would be sent — the strongest identity signal we have. */
  redirectHosts: z.array(z.string()),
});
export type OauthClient = z.infer<typeof zOauthClient>;

/** A connector the user has already authorized, for the revoke list. */
export const zOauthConnection = zOauthClient.extend({
  grantedAt: z.iso.datetime(),
  scopes: z.array(z.string()),
});
export type OauthConnection = z.infer<typeof zOauthConnection>;
