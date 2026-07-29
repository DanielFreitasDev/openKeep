import { positionBetween } from '@openkeep/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { notesQuery } from '../lib/notes-api.js';
import { patchSettings, settingsQuery } from '../lib/queries.js';
import { useSelectionStore } from '../stores/selection.js';
import { useUiStore } from '../stores/ui.js';
import { useKeyScope } from './use-key-scope.js';
import { useNoteMutations } from './use-note-mutations.js';

/**
 * Base + grid keyboard scopes (Keep's map, from the shared registry).
 * Handlers read stores imperatively so the bindings stay STABLE — rapid key
 * sequences never hit stale closures.
 */
export function useAppKeys() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const m = useNoteMutations();

  const bindings = useMemo(() => {
    const notesNow = () => queryClient.getQueryData(notesQuery.queryKey) ?? [];
    const focusedNow = () => {
      const id = useUiStore.getState().focusedNoteId;
      return id ? notesNow().find((n) => n.id === id) : undefined;
    };

    const moveFocus = (delta: number) => {
      const { viewNoteIds, focusedNoteId, setFocusedNoteId } = useUiStore.getState();
      if (viewNoteIds.length === 0) return;
      const idx = focusedNoteId ? viewNoteIds.indexOf(focusedNoteId) : -1;
      const next = idx === -1 ? (delta > 0 ? 0 : viewNoteIds.length - 1) : idx + delta;
      const clamped = Math.max(0, Math.min(viewNoteIds.length - 1, next));
      const id = viewNoteIds[clamped];
      if (!id) return;
      setFocusedNoteId(id);
      const el = document.querySelector(`[data-note-id="${id}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      (el?.querySelector('[role="button"]') as HTMLElement | null)?.focus();
    };

    const reorderFocused = (delta: number) => {
      const focused = focusedNow();
      if (!focused) return;
      const siblings = notesNow()
        .filter(
          (n) =>
            n.trashedAt === null &&
            !n.archived &&
            n.pinned === focused.pinned &&
            n.id !== focused.id,
        )
        .sort((a, b) => (a.position < b.position ? -1 : 1));
      const currentSorted = [...siblings, focused].sort((a, b) =>
        a.position < b.position ? -1 : 1,
      );
      const idx = currentSorted.findIndex((n) => n.id === focused.id);
      const target = idx + delta;
      if (target < 0 || target >= currentSorted.length) return;
      const without = currentSorted.filter((n) => n.id !== focused.id);
      const prev = without[target - 1];
      const next = without[target];
      const position = positionBetween(prev?.position ?? null, next?.position ?? null);
      m.patchState.mutate({ id: focused.id, patch: { position } });
    };

    const base: Record<string, () => void> = {
      c: () => document.dispatchEvent(new CustomEvent('openkeep:compose', { detail: 'text' })),
      l: () => document.dispatchEvent(new CustomEvent('openkeep:compose', { detail: 'list' })),
      '/': () => {
        void navigate({ to: '/search', search: (old: Record<string, unknown>) => old }).then(() =>
          (document.querySelector('header input[type="text"]') as HTMLInputElement | null)?.focus(),
        );
      },
      '?': () => useUiStore.getState().setActiveDialog('shortcuts'),
      'mod+/': () => useUiStore.getState().setActiveDialog('shortcuts'),
      'mod+g': () => {
        const settings = queryClient.getQueryData(settingsQuery.queryKey);
        const next = settings?.viewMode === 'grid' ? 'list' : 'grid';
        void patchSettings({ viewMode: next }).then((updated) =>
          queryClient.setQueryData(settingsQuery.queryKey, updated),
        );
      },
    };

    // Delete/Backspace trash the whole selection — the checkbox toolbar's
    // "Delete note" without reaching for the overflow menu.
    const trashSelection = () => {
      const selection = useSelectionStore.getState();
      if (selection.selected.size === 0) return;
      const ids = notesNow()
        .filter((n) => selection.selected.has(n.id) && n.trashedAt === null)
        .map((n) => n.id);
      selection.clear();
      m.trashManyWithUndo(ids);
    };

    const grid: Record<string, () => void> = {
      j: () => moveFocus(1),
      k: () => moveFocus(-1),
      'shift+j': () => reorderFocused(1),
      'shift+k': () => reorderFocused(-1),
      enter: () => {
        const focused = focusedNow();
        if (focused) {
          void navigate({
            to: '.',
            search: (old: Record<string, unknown>) => ({ ...old, note: focused.id }),
          });
        }
      },
      e: () => {
        const focused = focusedNow();
        if (focused && !focused.trashedAt) {
          if (focused.archived) m.unarchiveWithUndo(focused);
          else m.archiveWithUndo(focused);
        }
      },
      '#': () => {
        const focused = focusedNow();
        if (focused && !focused.trashedAt) m.trashWithUndo(focused);
      },
      f: () => {
        const focused = focusedNow();
        if (focused && !focused.trashedAt) m.togglePin(focused);
      },
      x: () => {
        const focused = focusedNow();
        if (focused) useSelectionStore.getState().toggle(focused.id);
      },
      'mod+a': () => useSelectionStore.getState().selectMany(useUiStore.getState().viewNoteIds),
      delete: trashSelection,
      backspace: trashSelection,
      escape: () => {
        const selection = useSelectionStore.getState();
        if (selection.selected.size > 0) selection.clear();
        else useUiStore.getState().setFocusedNoteId(null);
      },
    };

    return { base, grid };
  }, [navigate, queryClient, m]);

  useKeyScope('base', bindings.base);
  useKeyScope('grid', bindings.grid);

  // Focused note may disappear (archived/trashed elsewhere) — drop stale focus.
  const focusedNoteId = useUiStore((s) => s.focusedNoteId);
  const viewNoteIds = useUiStore((s) => s.viewNoteIds);
  const setFocusedNoteId = useUiStore((s) => s.setFocusedNoteId);
  useEffect(() => {
    if (focusedNoteId && !viewNoteIds.includes(focusedNoteId)) {
      setFocusedNoteId(null);
    }
  }, [focusedNoteId, viewNoteIds, setFocusedNoteId]);
}

/** Views call this to publish their visible order for j/k + Ctrl+A. */
export function usePublishViewOrder(ids: string[]) {
  const setViewNoteIds = useUiStore((s) => s.setViewNoteIds);
  useEffect(() => {
    setViewNoteIds(ids);
  }, [ids, setViewNoteIds]);
}
