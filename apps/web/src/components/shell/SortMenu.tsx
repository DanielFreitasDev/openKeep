import { Menu } from '@base-ui/react/menu';
import checkSvg from '@material-symbols/svg-700/outlined/check.svg?raw';
import sortSvg from '@material-symbols/svg-700/outlined/sort.svg?raw';
import type { NoteSort, UserSettings } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { patchSettings, settingsQuery } from '../../lib/queries.js';
import { Icon } from '../Icon.js';
import { iconButtonClass } from '../IconButton.js';

const OPTIONS: { value: NoteSort; key: string }[] = [
  { value: 'manual', key: 'sortManual' },
  { value: 'edited', key: 'sortEdited' },
  { value: 'created', key: 'sortCreated' },
  { value: 'title', key: 'sortTitle' },
];

const itemClass =
  'flex cursor-default select-none items-center gap-3 py-2.5 pr-4 pl-3 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

/**
 * Order of the note grids — a divergence from Keep, which only has the manual
 * order. Manual stays the default and the only one drag can rewrite, so the
 * other three never touch a position: switching back restores the arrangement.
 */
export function SortMenu({ size = 48, iconSize = 24 }: { size?: number; iconSize?: number }) {
  const { t } = useTranslation('shell');
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const noteSort = settings?.noteSort ?? 'manual';

  const setSort = useMutation({
    mutationFn: (next: NoteSort) => patchSettings({ noteSort: next }),
    onMutate: (next: NoteSort) => {
      queryClient.setQueryData(settingsQuery.queryKey, (old): UserSettings | undefined =>
        old ? { ...old, noteSort: next } : undefined,
      );
    },
    onSuccess: (data) => queryClient.setQueryData(settingsQuery.queryKey, data),
  });

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t('sortNotes')}
        data-tooltip={t('sortNotes')}
        className={iconButtonClass}
        style={{ width: size, height: size }}
      >
        <Icon svg={sortSvg} size={iconSize} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} align="end">
          <Menu.Popup className="z-50 min-w-56 rounded-lg border border-(--outline-variant) bg-surface py-2 shadow-(--elevation-3)">
            <Menu.RadioGroup value={noteSort} onValueChange={(v) => setSort.mutate(v as NoteSort)}>
              <div className="px-4 pt-1 pb-2 font-medium text-on-surface-variant text-xs uppercase tracking-wider">
                {t('sortNotes')}
              </div>
              {OPTIONS.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  className={itemClass}
                  closeOnClick
                >
                  <Menu.RadioItemIndicator
                    // Kept mounted so the label column does not shift on select.
                    keepMounted
                    className="flex w-5 flex-none justify-center data-[unchecked]:invisible"
                  >
                    <Icon svg={checkSvg} size={18} />
                  </Menu.RadioItemIndicator>
                  {t(option.key)}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
