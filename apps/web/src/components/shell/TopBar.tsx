import gridViewSvg from '@material-symbols/svg-400/outlined/grid_view.svg?raw';
import menuSvg from '@material-symbols/svg-400/outlined/menu.svg?raw';
import refreshSvg from '@material-symbols/svg-400/outlined/refresh.svg?raw';
import searchSvg from '@material-symbols/svg-400/outlined/search.svg?raw';
import viewAgendaSvg from '@material-symbols/svg-400/outlined/view_agenda.svg?raw';
import type { UserSettings } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { patchSettings, settingsQuery } from '../../lib/queries.js';
import { useUiStore } from '../../stores/ui.js';
import { IconButton } from '../IconButton.js';
import { AccountMenu } from './AccountMenu.js';
import { SettingsMenu } from './SettingsMenu.js';

export function TopBar() {
  const { t } = useTranslation('shell');
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);

  const viewMode = settings?.viewMode ?? 'grid';
  const toggleView = useMutation({
    mutationFn: () => patchSettings({ viewMode: viewMode === 'grid' ? 'list' : 'grid' }),
    onMutate: () => {
      const next: UserSettings['viewMode'] = viewMode === 'grid' ? 'list' : 'grid';
      queryClient.setQueryData(settingsQuery.queryKey, (old): UserSettings | undefined =>
        old ? { ...old, viewMode: next } : undefined,
      );
    },
    onSuccess: (data) => queryClient.setQueryData(settingsQuery.queryKey, data),
  });

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-(--topbar-h) items-center gap-1 border-b border-(--outline-variant) bg-surface px-2">
      <IconButton svg={menuSvg} label={t('mainMenu')} onClick={toggleSidebar} />

      <Link to="/" className="flex shrink-0 items-center gap-1 rounded px-1 outline-(--primary)">
        <img src="/favicon.svg" alt="" className="h-10 w-10 p-1" />
        <span className="hidden text-[22px] leading-none text-on-surface-variant md:inline">
          {t('common:appName')}
        </span>
      </Link>

      <search className="mx-2 hidden min-w-0 max-w-[720px] flex-1 sm:mx-4 sm:block">
        <div className="flex h-12 items-center rounded-lg bg-surface-container transition-shadow focus-within:bg-surface focus-within:shadow-(--elevation-2)">
          <IconButton svg={searchSvg} label={t('searchPlaceholder')} iconSize={22} />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            className="h-full w-full min-w-0 bg-transparent pr-4 text-base text-on-surface outline-none placeholder:text-on-surface-variant"
          />
        </div>
      </search>

      <div className="ml-auto flex items-center gap-1">
        <IconButton
          svg={refreshSvg}
          label={t('refresh')}
          onClick={() => void queryClient.invalidateQueries()}
        />
        <IconButton
          svg={viewMode === 'grid' ? viewAgendaSvg : gridViewSvg}
          label={viewMode === 'grid' ? t('listView') : t('gridView')}
          onClick={() => toggleView.mutate()}
        />
        <SettingsMenu />
        <div className="ml-1 mr-2">
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
