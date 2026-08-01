import { Dialog } from '@base-ui/react/dialog';
import type { AdminUser } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  adminOverviewQuery,
  adminUsersQuery,
  deleteUserApi,
  patchInstanceApi,
} from '../../lib/admin-api.js';
import { formatBytes } from '../../lib/bytes.js';
import { metaQuery } from '../../lib/queries.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { useUiStore } from '../../stores/ui.js';

/**
 * What the instance owner used to do with psql: who is here, what they cost,
 * whether the door is open, and the way out for an account that has to go.
 */
export function AdminDialog() {
  const { t, i18n } = useTranslation('admin');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const open = activeDialog === 'admin';

  const [search, setSearch] = useState('');
  const overview = useQuery({ ...adminOverviewQuery, enabled: open });
  const users = useQuery({ ...adminUsersQuery(search.trim()), enabled: open });
  const [pending, setPending] = useState<AdminUser | null>(null);
  const [typed, setTyped] = useState('');

  const signup = useMutation({
    mutationFn: patchInstanceApi,
    onSuccess: (data) => {
      queryClient.setQueryData(adminOverviewQuery.queryKey, data);
      // The login page reads the same switch out of instance meta.
      void queryClient.invalidateQueries({ queryKey: metaQuery.queryKey });
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: adminOverviewQuery.queryKey });
      show({ message: t('signupFailed') });
    },
  });

  const remove = useMutation({
    mutationFn: (user: AdminUser) => deleteUserApi(user.id),
    onSuccess: (result, user) => {
      setPending(null);
      setTyped('');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: adminOverviewQuery.queryKey });
      show({
        message: t(result.notes ? 'deleteDone' : 'deleteDoneEmpty', {
          email: user.email,
          count: result.notes,
        }),
      });
    },
    onError: () => show({ message: t('deleteFailed') }),
  });

  if (!open) return null;

  const dateLocale = i18n.language.startsWith('pt') ? ptBR : enUS;
  const bytes = (n: number) => formatBytes(n, i18n.language);
  const totals = overview.data?.totals;
  const armed = pending !== null && typed.trim().toLowerCase() === pending.email.toLowerCase();

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setActiveDialog(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(94vw,640px)] overflow-y-auto rounded-lg bg-surface p-6 shadow-(--elevation-3)">
          <Dialog.Title className="font-medium text-lg text-on-surface">{t('title')}</Dialog.Title>
          <p className="mt-1 text-on-surface-variant text-xs">
            {t('hint', { version: overview.data?.version ?? '—' })}
          </p>

          <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={t('statUsers')} value={String(totals?.users ?? '—')} />
            <Stat label={t('statNotes')} value={String(totals?.notes ?? '—')} />
            <Stat label={t('statAttachments')} value={String(totals?.attachments ?? '—')} />
            <Stat label={t('statStorage')} value={totals ? bytes(totals.storageBytes) : '—'} />
          </section>

          <section className="mt-5">
            <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
              {t('accessTitle')}
            </h3>
            <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5 text-on-surface text-sm">
              <span>
                {t('signupLabel')}
                <span className="block text-on-surface-variant text-xs">{t('signupHint')}</span>
              </span>
              {/* Uncontrolled like the Settings toggles: the box flips in the
                  same frame as the click, the PATCH follows behind. */}
              <input
                type="checkbox"
                disabled={!overview.data}
                defaultChecked={overview.data?.signupEnabled ?? true}
                key={String(overview.data?.signupEnabled)}
                onChange={(e) => signup.mutate({ signupEnabled: e.target.checked })}
                className="h-4 w-4 shrink-0 accent-(--primary)"
              />
            </label>
          </section>

          <section className="mt-5">
            <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
              {t('usersTitle')}
            </h3>
            {/* The list is a page, never the table: an instance can hold more
                accounts than a dialog can honestly draw, so searching is how
                you reach one and the line below says what is on screen. */}
            <input
              type="search"
              value={search}
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              className="mt-2 w-full rounded border border-(--outline) bg-transparent px-3 py-1.5 text-on-surface text-sm outline-none focus:border-(--primary)"
              onChange={(e) => setSearch(e.target.value)}
            />
            {users.data && (
              <p className="mt-2 text-on-surface-variant text-xs">
                {t('showing', { shown: users.data.users.length, total: users.data.total })}
              </p>
            )}
            <ul className="mt-2 divide-y divide-(--outline-variant)">
              {(users.data?.users ?? []).map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-on-surface text-sm">
                      {u.name}
                      {u.admin && (
                        <span className="ml-2 rounded-full border border-(--outline) px-1.5 py-0.5 align-middle text-[10px] text-on-surface-variant uppercase">
                          {t('adminBadge')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-on-surface-variant text-xs">{u.email}</p>
                    <p className="text-on-surface-variant text-xs">
                      {t('userMeta', {
                        notes: u.notes,
                        labels: u.labels,
                        size: bytes(u.storageBytes),
                        joined: format(new Date(u.createdAt), 'PP', { locale: dateLocale }),
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    // An admin address is refused by the server too; the button
                    // is not the rule, it just does not offer a dead end.
                    disabled={u.admin}
                    className="shrink-0 rounded border border-red-600 px-2.5 py-1 font-medium text-red-600 text-xs hover:bg-(--surface-hover) disabled:invisible dark:border-red-400 dark:text-red-400"
                    onClick={() => {
                      setTyped('');
                      setPending(u);
                    }}
                  >
                    {t('deleteUser')}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-6 flex justify-end">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:done')}
            </Dialog.Close>
          </div>

          <Dialog.Root open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-60 bg-(--scrim)" />
              <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-60 w-[min(92vw,420px)] rounded-lg bg-surface p-6 shadow-(--elevation-3)">
                <Dialog.Title className="font-medium text-lg text-on-surface">
                  {t('deleteTitle')}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-on-surface-variant text-sm">
                  {/* Zero gets its own sentence: pt-BR counts 0 as singular,
                      so the plural form would promise "the note they own". */}
                  {t(pending?.notes ? 'deleteBody' : 'deleteBodyEmpty', {
                    count: pending?.notes ?? 0,
                    email: pending?.email ?? '',
                  })}
                </Dialog.Description>
                <p className="mt-2 text-on-surface-variant text-sm">{t('deleteShared')}</p>
                <label
                  htmlFor="admin-delete-confirm"
                  className="mt-4 block text-on-surface text-sm"
                >
                  {t('deletePrompt', { email: pending?.email ?? '' })}
                </label>
                <input
                  id="admin-delete-confirm"
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
                    disabled={!armed || remove.isPending}
                    className="rounded bg-red-600 px-4 py-2 font-medium text-sm text-white disabled:opacity-40 dark:bg-red-500"
                    onClick={() => pending && remove.mutate(pending)}
                  >
                    {t('deleteConfirm')}
                  </button>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-(--outline-variant) px-3 py-2">
      <p className="text-on-surface-variant text-xs">{label}</p>
      <p className="mt-0.5 font-medium text-base text-on-surface">{value}</p>
    </div>
  );
}
