import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProtectionMutations } from '../../hooks/use-protection.js';
import { ApiError } from '../../lib/api.js';
import { notesQuery } from '../../lib/notes-api.js';
import { isRevealed, protectionQuery, setNotePin } from '../../lib/protection-api.js';
import { useSnackbarStore } from '../../stores/snackbar.js';

/**
 * Settings → protected notes: the PIN, and the way to close the curtain early.
 *
 * The PIN is a shortcut for the account password and nothing more, which is
 * why the password is what installs it and why this section says out loud what
 * the whole feature is not: the note is hidden, not encrypted. The server can
 * still read it, and so can anyone who reaches the database — anyone who needs
 * otherwise wants a different app, and should be told so here rather than
 * finding out later.
 */
export function NoteProtectionSection() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const { data: status } = useQuery(protectionQuery);
  const { data: notes } = useQuery(notesQuery);
  const { lockNow } = useProtectionMutations();

  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: (next: string | null) =>
      setNotePin({ pin: next, ...(status?.hasPassword ? { password } : {}) }),
    onSuccess: (_data, next) => {
      void queryClient.invalidateQueries({ queryKey: protectionQuery.queryKey });
      setOpen(false);
      setPin('');
      setPassword('');
      show({ message: next === null ? t('pinRemoved') : t('pinSaved') });
    },
  });

  const problem = save.error instanceof ApiError ? save.error.problem : null;
  const protectedCount = (notes ?? []).filter((n) => n.locked).length;
  const revealed = isRevealed(status);

  return (
    <section className="mt-4">
      <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
        {t('protectedNotes')}
      </h3>
      <p className="py-2 text-on-surface-variant text-sm">{t('protectionHint')}</p>
      <p className="pb-2 text-on-surface-variant text-sm">
        {t('protectedCount', { count: protectedCount })}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-(--outline) px-3 py-1.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
          onClick={() => {
            setPin('');
            setPassword('');
            save.reset();
            setOpen((v) => !v);
          }}
        >
          {status?.pinSet ? t('changePin') : t('setPin')}
        </button>
        {revealed && (
          <button
            type="button"
            className="rounded border border-(--outline) px-3 py-1.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
            onClick={() => lockNow.mutate()}
          >
            {t('lockNow')}
          </button>
        )}
      </div>

      {open && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(pin);
          }}
        >
          {status?.hasPassword && (
            <label className="flex flex-col gap-1 text-on-surface text-sm">
              {t('pinPasswordLabel')}
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                className="rounded border border-(--outline) bg-transparent px-2 py-1.5 text-on-surface text-sm outline-none focus:border-(--primary)"
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-on-surface text-sm">
            {t('pinLabel')}
            <input
              type="password"
              value={pin}
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              className="rounded border border-(--outline) bg-transparent px-2 py-1.5 text-on-surface text-sm outline-none focus:border-(--primary)"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {problem && (
            <p role="alert" className="text-red-600 text-sm dark:text-red-400">
              {problem.detail ?? problem.title}
            </p>
          )}
          {/* Removing rides in the same form: it needs the same password, so
              putting it outside would ask for the password twice. */}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pin.length < 4 || save.isPending}
              className="rounded bg-primary px-4 py-1.5 font-medium text-on-primary text-sm disabled:opacity-40"
            >
              {t('common:save')}
            </button>
            {status?.pinSet && (
              <button
                type="button"
                disabled={save.isPending}
                className="rounded px-4 py-1.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-40"
                onClick={() => save.mutate(null)}
              >
                {t('removePin')}
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
