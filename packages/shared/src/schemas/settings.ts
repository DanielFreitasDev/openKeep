import { z } from 'zod';

export const zTimeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)');

export const zViewMode = z.enum(['grid', 'list']);

/** Keep's Settings dialog + reminder defaults + roaming view mode. */
export const zUserSettings = z.object({
  addItemsToBottom: z.boolean(),
  moveCheckedToBottom: z.boolean(),
  richLinkPreviews: z.boolean(),
  sharingEnabled: z.boolean(),
  reminderMorning: zTimeHHMM,
  reminderAfternoon: zTimeHHMM,
  reminderEvening: zTimeHHMM,
  timezone: z.string().nullable(),
  viewMode: zViewMode,
});

export const zUserSettingsPatch = zUserSettings.partial();

export type UserSettings = z.infer<typeof zUserSettings>;
export type UserSettingsPatch = z.infer<typeof zUserSettingsPatch>;

/** Public instance metadata for the login page. */
export const zInstanceMeta = z.object({
  oauth: z.object({ google: z.boolean(), github: z.boolean() }),
  passwordReset: z.boolean(),
});
export type InstanceMeta = z.infer<typeof zInstanceMeta>;
