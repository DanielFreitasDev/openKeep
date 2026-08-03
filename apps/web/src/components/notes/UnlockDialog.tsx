import { Dialog } from '@base-ui/react/dialog';
import lockSvg from '@material-symbols/svg-700/outlined/lock.svg?raw';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api.js';
import {
  announceRevealChange,
  isRevealed,
  protectionQuery,
  refreshProtectedViews,
  unlockNotes,
} from '../../lib/protection-api.js';
import { useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';

/**
 * The re-authentication prompt. One per app, driven by `ui.unlockPrompt`:
 * every road to a protected note — clicking its card, following a `?note=`
 * link, asking from Settings — ends at this same dialog.
 *
 * It asks for the PIN when one is set and the password otherwise, and offers
 * the other as a way out, because the PIN is a shortcut and never a lock-out.
 * On success it does not "unhide" anything: it refetches, because the words
 * were never in this tab to begin with.
 */
export function UnlockDialog() {
  const { t } = useTranslation('notes');
  const target = useUiStore((s) => s.unlockPrompt);
  const setUnlockPrompt = useUiStore((s) => s.setUnlockPrompt);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ ...protectionQuery, enabled: target !== null });

  const [usePin, setUsePin] = useState(true);
  const [value, setValue] = useState('');

  // A PIN is only the default when there is one; a fresh prompt starts empty.
  useEffect(() => {
    if (target === null) return;
    setValue('');
    setUsePin(status?.pinSet === true);
  }, [target, status?.pinSet]);

  /**
   * The one way out, whichever road got here. The corpus is refetched BEFORE
   * the note opens — the editor takes its starting text from that cache, and
   * opening a beat early mounts it over the redacted copy, which is a blank
   * note the autosave would then be happy to keep. The guard is for the two
   * roads racing: the status arriving first would otherwise navigate while the
   * corpus is still in flight.
   */
  const opening = useRef(false);
  async function finish() {
    if (opening.current) return;
    opening.current = true;
    const noteId = target;
    await refreshProtectedViews(queryClient);
    setUnlockPrompt(null);
    setValue('');
    opening.current = false;
    if (noteId && noteId !== 'session') {
      void navigate({
        to: '.',
        search: (old: Record<string, unknown>) => ({ ...old, note: noteId }),
        resetScroll: false,
      });
    }
  }

  // Someone else already opened the curtain — a sibling tab, or a window that
  // was still running when this card was clicked. Nothing left to ask.
  const revealed = isRevealed(status);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `finish` is rebuilt each render but only ever reads `target`, which is a dependency
  useEffect(() => {
    if (target !== null && revealed) void finish();
  }, [target, revealed]);

  const unlock = useMutation({
    mutationFn: () => unlockNotes(usePin ? { pin: value } : { password: value }),
    onSuccess: async () => {
      announceRevealChange();
      await finish();
    },
  });

  const problem = unlock.error instanceof ApiError ? unlock.error.problem : null;
  const canSwitch = status?.pinSet === true && status.hasPassword;
  const tooShort = usePin ? value.length < 4 : value.length < 1;

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setUnlockPrompt(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-60 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-60 w-[min(92vw,380px)] rounded-lg bg-surface p-6 shadow-(--elevation-3)">
          <div className="flex items-center gap-2 text-on-surface">
            <Icon svg={lockSvg} size={20} />
            <Dialog.Title className="font-medium text-lg">{t('unlockTitle')}</Dialog.Title>
          </div>
          <Dialog.Description className="mt-2 text-on-surface-variant text-sm">
            {usePin ? t('unlockPinHint') : t('unlockPasswordHint')}
          </Dialog.Description>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!tooShort) unlock.mutate();
            }}
          >
            <input
              // Remounted when the credential changes so the browser never
              // offers a saved password into the PIN field, or the reverse.
              key={usePin ? 'pin' : 'password'}
              type="password"
              // biome-ignore lint/a11y/noAutofocus: a prompt the user asked for, with one field
              autoFocus
              value={value}
              inputMode={usePin ? 'numeric' : 'text'}
              autoComplete={usePin ? 'off' : 'current-password'}
              aria-label={usePin ? t('unlockPinLabel') : t('unlockPasswordLabel')}
              maxLength={usePin ? 8 : 200}
              className="mt-4 w-full rounded border border-(--outline) bg-transparent px-2 py-1.5 text-on-surface text-sm outline-none focus:border-(--primary)"
              onChange={(e) =>
                setValue(usePin ? e.target.value.replace(/\D/g, '') : e.target.value)
              }
            />
            {problem && (
              <p role="alert" className="mt-2 text-red-600 text-sm dark:text-red-400">
                {problem.detail ?? problem.title}
              </p>
            )}
            {canSwitch && (
              <button
                type="button"
                className="mt-3 text-primary text-sm hover:underline"
                onClick={() => {
                  setUsePin((v) => !v);
                  setValue('');
                  unlock.reset();
                }}
              >
                {usePin ? t('unlockUsePassword') : t('unlockUsePin')}
              </button>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close className="rounded px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)">
                {t('common:cancel')}
              </Dialog.Close>
              <button
                type="submit"
                disabled={tooShort || unlock.isPending}
                className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover) disabled:opacity-40"
              >
                {t('unlockConfirm')}
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
