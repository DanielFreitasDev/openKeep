/**
 * The 12 Keep note colors. Semantic names are what we persist; each maps to a
 * light-theme and a dark-theme hex (Keep uses distinct muted palettes per theme).
 */
export const NOTE_COLORS = [
  'default',
  'coral',
  'peach',
  'sand',
  'mint',
  'sage',
  'fog',
  'storm',
  'dusk',
  'blossom',
  'clay',
  'chalk',
] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export const NOTE_COLOR_HEX: Record<'light' | 'dark', Record<NoteColor, string>> = {
  light: {
    default: '#ffffff',
    coral: '#faafa8',
    peach: '#f39f76',
    sand: '#fff8b8',
    mint: '#e2f6d3',
    sage: '#b4ddd3',
    fog: '#d4e4ed',
    storm: '#aeccdc',
    dusk: '#d3bfdb',
    blossom: '#f6e2dd',
    clay: '#e9e3d4',
    chalk: '#efeff1',
  },
  dark: {
    default: '#202124',
    coral: '#77172e',
    peach: '#692b17',
    sand: '#7c4a03',
    mint: '#264d3b',
    sage: '#0c625d',
    fog: '#256377',
    storm: '#284255',
    dusk: '#472e5b',
    blossom: '#6c394f',
    clay: '#4b443a',
    chalk: '#232427',
  },
};

/** Google Takeout exports colors as these enum strings. */
export const TAKEOUT_COLOR_MAP: Record<string, NoteColor> = {
  DEFAULT: 'default',
  RED: 'coral',
  ORANGE: 'peach',
  YELLOW: 'sand',
  GREEN: 'mint',
  TEAL: 'sage',
  BLUE: 'fog',
  CERULEAN: 'storm',
  PURPLE: 'dusk',
  PINK: 'blossom',
  BROWN: 'clay',
  GRAY: 'chalk',
};
