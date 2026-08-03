import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { notesQuery } from '../lib/notes-api.js';
import {
  announceRevealChange,
  isRevealed,
  lockNote,
  lockNotesNow,
  onRevealChange,
  protectionQuery,
  refreshProtectedViews,
  unlockNote,
} from '../lib/protection-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';
import { useUiStore } from '../stores/ui.js';

/**
 * Is the curtain up right now? Every screen that draws a protected note asks
 * this, and it is deliberately the SERVER's answer: the client cannot decide
 * it holds content it was never sent.
 */
export function useRevealed(): boolean {
  const { data } = useQuery(protectionQuery);
  return isRevealed(data);
}

/**
 * Keeps the board honest as the window closes. The reveal ends on a clock, and
 * the notes on screen were fetched with their words in them — so when it runs
 * out, the corpus is refetched (redacted this time) and any protected note
 * standing open in the editor is shut. Sibling tabs hear it too: they share
 * the session, so they share the curtain.
 */
export function useRevealExpiry(): void {
  const { data } = useQuery(protectionQuery);
  const queryClient = useQueryClient();
  const openEditorNoteId = useUiStore((s) => s.openEditorNoteId);

  useEffect(() => onRevealChange(() => void refreshProtectedViews(queryClient)), [queryClient]);

  useEffect(() => {
    if (!data?.unlockedUntil) return;
    const ms = Date.parse(data.unlockedUntil) - Date.now();
    if (ms <= 0) {
      void refreshProtectedViews(queryClient);
      return;
    }
    const timer = window.setTimeout(() => {
      const notes = queryClient.getQueryData(notesQuery.queryKey);
      const open = notes?.find((n) => n.id === openEditorNoteId);
      if (open?.locked) useUiStore.getState().setUnlockPrompt(open.id);
      void refreshProtectedViews(queryClient);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [data?.unlockedUntil, queryClient, openEditorNoteId]);
}

/** Protect / unprotect a note, and close the curtain on the whole session. */
export function useProtectionMutations() {
  const { t } = useTranslation('notes');
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);

  const protect = useMutation({
    mutationFn: (id: string) => lockNote(id),
    onSuccess: () => {
      void refreshProtectedViews(queryClient);
      show({ message: t('noteProtected') });
    },
  });

  const unprotect = useMutation({
    mutationFn: (id: string) => unlockNote(id),
    onSuccess: () => {
      void refreshProtectedViews(queryClient);
      show({ message: t('unprotectedNote') });
    },
  });

  const lockNow = useMutation({
    mutationFn: lockNotesNow,
    onSuccess: () => {
      void refreshProtectedViews(queryClient);
      announceRevealChange();
      show({ message: t('lockedNow') });
    },
  });

  return { protect, unprotect, lockNow };
}
