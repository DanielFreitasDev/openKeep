import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { notesQuery } from '../lib/notes-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';
import { useReminderMutations } from './use-reminder-mutations.js';

/**
 * In-app reminder toasts: scans the corpus every 30s; when a reminder's
 * effective time passes while the app is open, shows a snackbar once per
 * occurrence. Dismissal syncs to other devices via POST /dismiss.
 */
export function useReminderToasts() {
  const { t } = useTranslation('reminders');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const show = useSnackbarStore((s) => s.show);
  const m = useReminderMutations();
  const { data: notes } = useQuery(notesQuery);
  const shownRef = useRef(new Set<string>());
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    const check = () => {
      const list = notesRef.current;
      if (!list) return;
      const now = Date.now();
      for (const note of list) {
        const rem = note.reminder;
        if (!rem || note.trashedAt) continue;
        const effective = new Date(rem.snoozedUntil ?? rem.remindAt).getTime();
        const key = `${note.id}:${rem.snoozedUntil ?? rem.remindAt}`;
        const recentWindow = now - 10 * 60 * 1000; // only toast for the last 10 min
        if (effective <= now && effective > recentWindow && !shownRef.current.has(key)) {
          shownRef.current.add(key);
          show({
            message: t('firedToast', { title: note.title || t('untitled') }),
            actionLabel: t('open'),
            onAction: () => {
              void navigate({
                to: '.',
                search: (old: Record<string, unknown>) => ({ ...old, note: note.id }),
                resetScroll: false,
              });
            },
            durationMs: 15_000,
          });
          m.dismiss.mutate(note.id);
          // Refresh so recurring reminders show their advanced time.
          setTimeout(
            () => void queryClient.invalidateQueries({ queryKey: notesQuery.queryKey }),
            5_000,
          );
        }
      }
    };
    const id = setInterval(check, 30_000);
    check();
    return () => clearInterval(id);
  }, [show, t, navigate, m.dismiss, queryClient]);
}
