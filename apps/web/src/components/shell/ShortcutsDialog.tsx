import { Dialog } from '@base-ui/react/dialog';
import { SHORTCUTS } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useUiStore } from '../../stores/ui.js';

const GROUPS = ['navigation', 'application', 'actions', 'editor'] as const;

const EMPTY_DIALOG_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/** The "?" help dialog — rendered straight from the shared shortcut registry. */
export function ShortcutsDialog() {
  const { t } = useTranslation('shortcuts');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);

  useKeyScope('dialog', EMPTY_DIALOG_BINDINGS, activeDialog === 'shortcuts');
  if (activeDialog !== 'shortcuts') return null;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setActiveDialog(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[min(94vw,560px)] flex-col rounded-lg bg-surface shadow-(--elevation-3)">
          <Dialog.Title className="px-6 pt-5 pb-1 font-medium text-lg text-on-surface">
            {t('title')}
          </Dialog.Title>
          <div className="flex-1 overflow-y-auto px-6 pb-4">
            {GROUPS.map((group) => (
              <section key={group} className="mt-4">
                <h3 className="mb-2 font-medium text-on-surface-variant text-xs uppercase tracking-wide">
                  {t(`group_${group}`)}
                </h3>
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-1.5">
                    <span className="text-on-surface text-sm">{t(s.labelKey)}</span>
                    <kbd className="rounded border border-(--outline) bg-surface-container px-2 py-0.5 font-mono text-on-surface-variant text-xs">
                      {s.display}
                    </kbd>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <div className="flex justify-end border-(--outline-variant) border-t px-4 py-3">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:close')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
