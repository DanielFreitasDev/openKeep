import { z } from 'zod';

/**
 * Whether the signed-in account administers this instance. Its own tiny route
 * because admin-ness is not user settings (nothing here is patchable) and not
 * instance meta (that one is anonymous and cached forever).
 */
export const zAdminMe = z.object({ admin: z.boolean() });
export type AdminMe = z.infer<typeof zAdminMe>;

/** One row of the users table in the admin panel. */
export const zAdminUser = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  /** Listed in ADMIN_EMAILS — the env is the authority, not this flag. */
  admin: z.boolean(),
  /** Notes this user owns, trash included. */
  notes: z.number().int().nonnegative(),
  labels: z.number().int().nonnegative(),
  /** Bytes of attachments hanging on the notes they own. */
  storageBytes: z.number().int().nonnegative(),
});
export type AdminUser = z.infer<typeof zAdminUser>;

/** How many accounts one request will draw. */
export const ADMIN_USERS_PAGE_SIZE = 50;

export const zAdminUsersQuery = z.object({
  /** Case-insensitive substring of name or e-mail. */
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(ADMIN_USERS_PAGE_SIZE),
});

/**
 * A page, not the whole table: an instance can have more accounts than a
 * dialog can honestly draw, so the count comes along and the panel says how
 * many of how many it is showing.
 */
export const zAdminUserPage = z.object({
  users: z.array(zAdminUser),
  /** Accounts matching the query — not the page length. */
  total: z.number().int().nonnegative(),
});
export type AdminUserPage = z.infer<typeof zAdminUserPage>;

/** Instance totals plus the policy switches the panel can flip. */
export const zAdminOverview = z.object({
  signupEnabled: z.boolean(),
  version: z.string(),
  totals: z.object({
    users: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    attachments: z.number().int().nonnegative(),
    storageBytes: z.number().int().nonnegative(),
  }),
});
export type AdminOverview = z.infer<typeof zAdminOverview>;

export const zAdminInstancePatch = z.object({ signupEnabled: z.boolean() });
export type AdminInstancePatch = z.infer<typeof zAdminInstancePatch>;

/**
 * Deleting an account is past the trash and past undo, so the body carries a
 * literal too — an accidental POST from a script is not enough.
 */
export const zDeleteUser = z.object({ confirm: z.literal('delete-user') });

export const zDeleteUserResult = z.object({
  /** Notes destroyed with their attachment files. */
  notes: z.number().int().nonnegative(),
});
export type DeleteUserResult = z.infer<typeof zDeleteUserResult>;
