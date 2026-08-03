import { Dialog } from '@base-ui/react/dialog';
import type { UserSettings } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { patchSettings, settingsQuery } from '../../lib/queries.js';
import { useUiStore } from '../../stores/ui.js';
import { Select } from '../Select.js';
import { CalendarFeedSection } from './CalendarFeedSection.js';
import { DeleteAllNotesSection } from './DeleteAllNotesSection.js';
import { StorageSection } from './StorageSection.js';

const EMPTY_DIALOG_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/** Keep's Settings dialog: toggles apply immediately. */
export function SettingsDialog() {
  const { t } = useTranslation('settings');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);

  const patch = useMutation({
    mutationFn: patchSettings,
    // Synchronous optimistic flip: the checkbox must reflect the click in the
    // same event tick (no awaits before setQueryData).
    onMutate: (p) => {
      queryClient.setQueryData(settingsQuery.queryKey, (old): UserSettings | undefined =>
        old ? { ...old, ...p } : undefined,
      );
    },
    onSuccess: (data) => queryClient.setQueryData(settingsQuery.queryKey, data),
  });

  const open = activeDialog === 'settings';
  useKeyScope('dialog', EMPTY_DIALOG_BINDINGS, open);
  if (!open || !settings) return null;

  const toggle = (key: keyof UserSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    patch.mutate({ [key]: e.target.checked });

  const time = (key: 'reminderMorning' | 'reminderAfternoon' | 'reminderEvening') => (
    <input
      id={`settings-${key}`}
      type="time"
      value={settings[key]}
      onChange={(e) => {
        if (e.target.value) patch.mutate({ [key]: e.target.value });
      }}
      className="rounded border border-(--outline) bg-transparent px-2 py-1 text-on-surface text-sm"
    />
  );

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setActiveDialog(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 max-h-[80vh] w-[min(92vw,480px)] overflow-y-auto rounded-lg bg-surface p-6 shadow-(--elevation-3)">
          <Dialog.Title className="font-medium text-lg text-on-surface">{t('title')}</Dialog.Title>

          <section className="mt-4">
            <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
              {t('notesAndLists')}
            </h3>
            <Check
              label={t('addToBottom')}
              checked={settings.addItemsToBottom}
              onChange={toggle('addItemsToBottom')}
            />
            <Check
              label={t('moveChecked')}
              checked={settings.moveCheckedToBottom}
              onChange={toggle('moveCheckedToBottom')}
            />
            <Check
              label={t('richPreviews')}
              checked={settings.richLinkPreviews}
              onChange={toggle('richLinkPreviews')}
            />
            <div className="flex items-center justify-between py-2.5 text-on-surface text-sm">
              {t('themeLabel')}
              <Select
                value={theme}
                options={[
                  { value: 'system', label: t('themeSystem') },
                  { value: 'light', label: t('themeLight') },
                  { value: 'dark', label: t('themeDark') },
                ]}
                label={t('themeLabel')}
                size="md"
                className="flex-none"
                onChange={setTheme}
              />
            </div>
          </section>

          <section className="mt-4">
            <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
              {t('reminderDefaults')}
            </h3>
            <div className="flex flex-col gap-2 py-2">
              <label
                htmlFor="settings-reminderMorning"
                className="flex items-center justify-between text-on-surface text-sm"
              >
                {t('morning')} {time('reminderMorning')}
              </label>
              <label
                htmlFor="settings-reminderAfternoon"
                className="flex items-center justify-between text-on-surface text-sm"
              >
                {t('afternoon')} {time('reminderAfternoon')}
              </label>
              <label
                htmlFor="settings-reminderEvening"
                className="flex items-center justify-between text-on-surface text-sm"
              >
                {t('evening')} {time('reminderEvening')}
              </label>
            </div>
          </section>

          <section className="mt-4">
            <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
              {t('sharing')}
            </h3>
            <Check
              label={t('enableSharing')}
              checked={settings.sharingEnabled}
              onChange={toggle('sharingEnabled')}
            />
          </section>

          <CalendarFeedSection />
          <StorageSection />
          <DeleteAllNotesSection />

          <div className="mt-6 flex justify-end">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:done')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-2.5 text-on-surface text-sm">
      {label}
      {/* Uncontrolled: the box must flip in the same frame as the click;
          the PATCH + cache update follow behind. */}
      <input
        type="checkbox"
        defaultChecked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-(--primary)"
      />
    </label>
  );
}
