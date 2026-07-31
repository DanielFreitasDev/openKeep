import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';

export const zTimeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24h)');

/**
 * A search kept as a sidebar shortcut. The query language already spells every
 * filter the search screen offers — `label:`, `color:`, `has:`, `is:`, dates —
 * so a saved search is a name plus the same string the box holds, and the tile
 * filters are folded into it when saving. The one exception is the People
 * filter: a collaborator is a user id, which no operator can express.
 */
export const zSavedSearch = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(LIMITS.savedSearchNameMax),
  q: z.string().max(LIMITS.searchQueryMax),
  collaborator: z.string().max(64).optional(),
});

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
  /** Sidebar shortcuts, in the order they were saved (newest last). */
  savedSearches: z.array(zSavedSearch).max(LIMITS.savedSearchesPerUserMax),
});

export const zUserSettingsPatch = zUserSettings.partial();

export type SavedSearch = z.infer<typeof zSavedSearch>;
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
