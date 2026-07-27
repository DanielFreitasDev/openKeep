/**
 * The 9 note background illustrations (original artwork, same themes as Keep).
 * `none` means no background.
 */
export const NOTE_BACKGROUNDS = [
  'none',
  'groceries',
  'food',
  'music',
  'recipes',
  'notes',
  'places',
  'travel',
  'video',
  'celebration',
] as const;

export type NoteBackground = (typeof NOTE_BACKGROUNDS)[number];
