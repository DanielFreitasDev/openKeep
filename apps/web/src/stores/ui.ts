import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';
export type ActiveDialog =
  | 'settings'
  | 'shortcuts'
  | 'edit-labels'
  | 'share'
  | 'import-export'
  | 'api-tokens'
  | null;

const THEME_KEY = 'openkeep-theme';

function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}

export function isDarkEffective(pref: ThemePref): boolean {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return pref === 'dark';
}

function applyTheme(pref: ThemePref) {
  document.documentElement.classList.toggle('dark', isDarkEffective(pref));
}

interface UiState {
  theme: ThemePref;
  /** Persistent (hamburger) sidebar expansion. */
  sidebarOpen: boolean;
  activeDialog: ActiveDialog;
  focusedNoteId: string | null;
  /** Small-screen overlay drawer (hamburger on mobile). */
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;
  /** Ordered ids of the notes visible in the current view (for j/k). */
  viewNoteIds: string[];
  setViewNoteIds: (ids: string[]) => void;
  setTheme: (t: ThemePref) => void;
  toggleDarkTheme: () => void;
  toggleSidebar: () => void;
  setActiveDialog: (d: ActiveDialog) => void;
  setFocusedNoteId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: readThemePref(),
  sidebarOpen: true,
  activeDialog: null,
  focusedNoteId: null,
  mobileDrawerOpen: false,
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
  viewNoteIds: [],
  setViewNoteIds: (viewNoteIds) =>
    set((s) => {
      const same =
        s.viewNoteIds.length === viewNoteIds.length &&
        s.viewNoteIds.every((id, i) => id === viewNoteIds[i]);
      return same ? {} : { viewNoteIds };
    }),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
    applyTheme(theme);
    set({ theme });
  },
  toggleDarkTheme: () => {
    const dark = isDarkEffective(get().theme);
    get().setTheme(dark ? 'light' : 'dark');
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActiveDialog: (activeDialog) => set({ activeDialog }),
  setFocusedNoteId: (focusedNoteId) => set({ focusedNoteId }),
}));

// Follow OS theme changes while pref is "system".
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useUiStore.getState();
    if (theme === 'system') applyTheme(theme);
  });
}
