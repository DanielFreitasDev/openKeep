import { z } from 'zod';

/**
 * What this account costs the instance, and the ceiling it is measured against.
 *
 * Its own tiny route (`GET /api/storage`) rather than a field of user settings:
 * nothing here is patchable, and the ceiling belongs to the deploy, not to the
 * person — the same reason admin-ness got `GET /api/admin/me`.
 */
export const zStorageUsage = z.object({
  /** Bytes of attachments on the notes this account owns, trash included. */
  usedBytes: z.number().int().nonnegative(),
  /** The per-account cap, or null when this instance sets none. */
  quotaBytes: z.number().int().positive().nullable(),
});
export type StorageUsage = z.infer<typeof zStorageUsage>;
