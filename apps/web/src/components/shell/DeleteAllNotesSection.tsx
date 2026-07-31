import { Dialog } from '@base-ui/react/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import { notesQuery } from '../../lib/notes-api.js';
import { useSnackbarStore } from '../../stores/snackbar.js';

interface DeleteAllResult {
  deleted: number;
  left: number;
}

/**
 * Settings → the point of no return. Past the trash, past undo, so the button
 * is not the confirmation: the user has to type the word, and the count of
 * what will go is on screen while they do it.
 */
export function DeleteAllNotesSection() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const { data: notes } = useQuery(notesQuery);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const word = t('deleteAllWord');
  const owned = (notes ?? []).filter((n) => n.role === 'owner').length;
  const shared = (notes ?? []).length - owned;

  const deleteAll = useMutation({
    mutationFn: () =>
      api<DeleteAllResult>('/api/notes/delete-all', {
        method: 'POST',
        body: { confirm: 'delete-all-notes' },
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(notesQuery.queryKey, []);
      setOpen(false);
      setTyped('');
      show({ message: t('deleteAllDone', { count: result.deleted }) });
    },
    onError: () => show({ message: t('deleteAllFailed') }),
  });

  const armed = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();

  return (
    <section className="mt-6 border-(--outline-variant) border-t pt-4">
      <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
        {t('dangerZone')}
      </h3>
      <p className="py-2 text-on-surface-variant text-sm">{t('deleteAllHint')}</p>
      <button
        type="button"
        className="rounded border border-red-600 px-3 py-1.5 font-medium text-red-600 text-sm hover:bg-(--surface-hover) dark:border-red-400 dark:text-red-400"
        onClick={() => {
          setTyped('');
          setOpen(true);
        }}
      >
        {t('deleteAll')}
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-60 bg-(--scrim)" />
          <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-60 w-[min(92vw,420px)] rounded-lg bg-surface p-6 shadow-(--elevation-3)">
            <Dialog.Title className="font-medium text-lg text-on-surface">
              {t('deleteAllTitle')}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-on-surface-variant text-sm">
              {t('deleteAllBody', { count: owned })}
            </Dialog.Description>
            {shared > 0 && (
              <p className="mt-2 text-on-surface-variant text-sm">
                {t('deleteAllShared', { count: shared })}
              </p>
            )}
            <label
              htmlFor="delete-all-confirm"
              className="mt-4 block text-on-surface text-sm"
              // The word is the confirmation; the button only carries it out.
            >
              {t('deleteAllPrompt', { word })}
            </label>
            <input
              id="delete-all-confirm"
              type="text"
              value={typed}
              autoComplete="off"
              className="mt-1 w-full rounded border border-(--outline) bg-transparent px-2 py-1.5 text-on-surface text-sm outline-none focus:border-(--primary)"
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close className="rounded px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)">
                {t('common:cancel')}
              </Dialog.Close>
              <button
                type="button"
                disabled={!armed || deleteAll.isPending}
                className="rounded bg-red-600 px-4 py-2 font-medium text-sm text-white disabled:opacity-40 dark:bg-red-500"
                onClick={() => deleteAll.mutate()}
              >
                {t('deleteAllConfirm')}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
