import type { FullNote, SetReminder } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mergeNote } from '../lib/note-selectors.js';
import { notesQuery } from '../lib/notes-api.js';
import { deleteReminderApi, dismissReminderApi, setReminderApi } from '../lib/reminders-api.js';

export function useReminderMutations() {
  const queryClient = useQueryClient();

  const setNoteReminder = (noteId: string, reminder: FullNote['reminder']) =>
    queryClient.setQueryData(notesQuery.queryKey, (old) => mergeNote(old, noteId, { reminder }));

  const set = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: SetReminder }) =>
      setReminderApi(noteId, body),
    onMutate: ({ noteId, body }) =>
      setNoteReminder(noteId, {
        remindAt: body.remindAt,
        rrule: body.rrule ?? null,
        timezone: body.timezone,
        snoozedUntil: null,
        done: false,
      }),
    onSuccess: (reminder, { noteId }) => setNoteReminder(noteId, reminder),
  });

  const remove = useMutation({
    mutationFn: (noteId: string) => deleteReminderApi(noteId),
    onMutate: (noteId) => setNoteReminder(noteId, null),
  });

  const dismiss = useMutation({
    mutationFn: (noteId: string) => dismissReminderApi(noteId),
  });

  return { set, remove, dismiss };
}
