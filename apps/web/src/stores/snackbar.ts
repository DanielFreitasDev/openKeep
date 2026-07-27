import { LIMITS } from '@openkeep/shared';
import { create } from 'zustand';

export interface Snack {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface SnackbarState {
  current: Snack | null;
  show: (snack: Omit<Snack, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  dismiss: (id?: number) => void;
}

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Keep shows one snackbar at a time, bottom-left; a new one replaces it. */
export const useSnackbarStore = create<SnackbarState>((set, get) => ({
  current: null,
  show: (snack) => {
    const id = nextId++;
    const durationMs = snack.durationMs ?? (snack.onAction ? LIMITS.undoWindowMs : 4000);
    if (timer) clearTimeout(timer);
    set({ current: { ...snack, id, durationMs } });
    timer = setTimeout(() => {
      if (get().current?.id === id) set({ current: null });
    }, durationMs);
  },
  dismiss: (id) => {
    const cur = get().current;
    if (cur && (id === undefined || cur.id === id)) {
      if (timer) clearTimeout(timer);
      set({ current: null });
    }
  },
}));
