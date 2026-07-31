import { z } from 'zod';

export const zTimeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)');

export const zViewMode = z.enum(['grid', 'list']);

/**
 * How the note grids order themselves. `manual` is the fractional position —
 * the only order the user can drag — and stays the default; the others are
 * client-side views over the same corpus and never touch a position.
 */
export const zNoteSort = z.enum(['manual', 'edited', 'created', 'title']);

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
  noteSort: zNoteSort,
});

export const zUserSettingsPatch = zUserSettings.partial();

export type NoteSort = z.infer<typeof zNoteSort>;
export type UserSettings = z.infer<typeof zUserSettings>;
export type UserSettingsPatch = z.infer<typeof zUserSettingsPatch>;

/** Public instance metadata for the login page, plus instance-wide policy the UI states out loud. */
export const zInstanceMeta = z.object({
  oauth: z.object({ google: z.boolean(), github: z.boolean() }),
  passwordReset: z.boolean(),
  /** How long trashed notes survive before the hourly purge takes them. */
  trashRetentionDays: z.number().int().positive(),
});
export type InstanceMeta = z.infer<typeof zInstanceMeta>;
