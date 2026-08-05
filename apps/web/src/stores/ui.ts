import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';
export type ActiveDialog =
  | 'settings'
  | 'shortcuts'
  | 'edit-labels'
  | 'share'
  | 'import-export'
  | 'api-tokens'
  | 'webhooks'
  | 'admin'
  | null;

const THEME_KEY = 'openkeep-theme';
const COLLAPSED_LABELS_KEY = 'openkeep-collapsed-labels';

function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // ignore
  }
  return 'system';
}

/**
 * Which sub-label folders are *closed*. Storing the closed ones rather than the
 * open ones is what makes a brand-new sub-label visible the moment it is
 * created — the default has to be "expanded", and an empty list says that.
 */
function readCollapsedLabels(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_LABELS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    // ignore
  }
  return [];
}

export function isDarkEffective(pref: ThemePref): boolean {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return pref === 'dark';
}

// Mirror --surface in styles/app.css. Also hardcoded in index.html and
// public/theme-init.js (plain files that cannot import).
const SURFACE_LIGHT = '#ffffff';
const SURFACE_DARK = '#202124';

function applyTheme(pref: ThemePref) {
  const dark = isDarkEffective(pref);
  document.documentElement.classList.toggle('dark', dark);
  // Keep the installed-PWA title bar on the app surface color: forced prefs
  // override both media-scoped <meta name="theme-color"> tags; "system"
  // restores their defaults so the OS scheme picks the active one.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const metaIsDark = meta.getAttribute('media')?.includes('dark') ?? false;
    const effectiveDark = pref === 'system' ? metaIsDark : dark;
    meta.setAttribute('content', effectiveDark ? SURFACE_DARK : SURFACE_LIGHT);
  }
}

interface UiState {
  theme: ThemePref;
  /** Persistent (hamburger) sidebar expansion. */
  sidebarOpen: boolean;
  activeDialog: ActiveDialog;
  focusedNoteId: string | null;
  /** Note currently open in the editor modal — its card hides content but keeps its footprint. */
  openEditorNoteId: string | null;
  setOpenEditorNoteId: (id: string | null) => void;
  /**
   * The unlock prompt, when one is up: the id of the protected note that asked
   * for it, or `'session'` when the reveal was asked for on its own (Settings).
   * Null closes it.
   */
  unlockPrompt: string | null;
  setUnlockPrompt: (target: string | null) => void;
  /** Small-screen overlay drawer (hamburger on mobile). */
  mobileDrawerOpen: boolean;
  setMobileDrawerOpen: (open: boolean) => void;
  /** Label ids whose sub-labels are hidden in the sidebar (persisted). */
  collapsedLabels: string[];
  toggleLabelCollapsed: (id: string) => void;
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
  openEditorNoteId: null,
  setOpenEditorNoteId: (openEditorNoteId) => set({ openEditorNoteId }),
  unlockPrompt: null,
  setUnlockPrompt: (unlockPrompt) => set({ unlockPrompt }),
  mobileDrawerOpen: false,
  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
  collapsedLabels: readCollapsedLabels(),
  toggleLabelCollapsed: (id) =>
    set((s) => {
      const collapsedLabels = s.collapsedLabels.includes(id)
        ? s.collapsedLabels.filter((x) => x !== id)
        : [...s.collapsedLabels, id];
      try {
        localStorage.setItem(COLLAPSED_LABELS_KEY, JSON.stringify(collapsedLabels));
      } catch {
        // ignore
      }
      return { collapsedLabels };
    }),
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
