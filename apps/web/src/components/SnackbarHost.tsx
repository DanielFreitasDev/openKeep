import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import { useTranslation } from 'react-i18next';
import { useSnackbarStore } from '../stores/snackbar.js';
import { IconButton } from './IconButton.js';

/** Bottom-left undo snackbar (Keep style). */
export function SnackbarHost() {
  const { t } = useTranslation('common');
  const snack = useSnackbarStore((s) => s.current);
  const dismiss = useSnackbarStore((s) => s.dismiss);

  if (!snack) return null;

  return (
    <output
      className="fixed bottom-6 left-6 z-50 flex min-w-72 max-w-[min(90vw,480px)] items-center gap-2 rounded-lg bg-[#202124] py-1.5 pr-1.5 pl-4 text-[#e8eaed] text-sm shadow-(--elevation-3) dark:bg-[#e8eaed] dark:text-[#202124]"
      aria-live="polite"
    >
      <span className="flex-1 py-1.5">{snack.message}</span>
      {snack.actionLabel && snack.onAction && (
        <button
          type="button"
          className="rounded px-3 py-1.5 font-medium text-[#fdd663] uppercase tracking-wide hover:bg-white/10 dark:text-[#b26a00] dark:hover:bg-black/10"
          onClick={() => {
            snack.onAction?.();
            dismiss(snack.id);
          }}
        >
          {snack.actionLabel}
        </button>
      )}
      <IconButton
        svg={closeSvg}
        label={t('close')}
        size={36}
        iconSize={18}
        className="text-inherit"
        onClick={() => dismiss(snack.id)}
      />
    </output>
  );
}
