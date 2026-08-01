import arrowBackSvg from '@material-symbols/svg-700/outlined/arrow_back.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import cloudDoneSvg from '@material-symbols/svg-700/outlined/cloud_done.svg?raw';
import gridViewSvg from '@material-symbols/svg-700/outlined/grid_view.svg?raw';
import menuSvg from '@material-symbols/svg-700/outlined/menu.svg?raw';
import progressActivitySvg from '@material-symbols/svg-700/outlined/progress_activity.svg?raw';
import refreshSvg from '@material-symbols/svg-700/outlined/refresh.svg?raw';
import searchSvg from '@material-symbols/svg-700/outlined/search.svg?raw';
import viewAgendaSvg from '@material-symbols/svg-700/outlined/view_agenda.svg?raw';
import type { UserSettings } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { patchSettings, settingsQuery } from '../../lib/queries.js';
import { useUiStore } from '../../stores/ui.js';
import { IconButton } from '../IconButton.js';
import { AccountMenu } from './AccountMenu.js';
import { SettingsMenu } from './SettingsMenu.js';
import { SortMenu } from './SortMenu.js';

export function TopBar() {
  const { t } = useTranslation('shell');
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const urlSearch = useSearch({ strict: false }) as { q?: string };
  const onSearchRoute = pathname === '/search';
  /** Trash and Reminders carry their own order, so the picker stays out of them. */
  const sortable =
    pathname === '/' ||
    pathname === '/archive' ||
    pathname === '/templates' ||
    onSearchRoute ||
    pathname.startsWith('/label/');
  const searchValue = onSearchRoute ? (urlSearch.q ?? '') : '';

  const goSearch = (q: string) =>
    void navigate({
      to: '/search',
      search: (old: Record<string, unknown>) => ({ ...old, q: q === '' ? undefined : q }),
      replace: onSearchRoute,
    });

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

  const viewToggleButton = (size?: number, iconSize?: number) => (
    <IconButton
      svg={viewMode === 'grid' ? viewAgendaSvg : gridViewSvg}
      label={viewMode === 'grid' ? t('listView') : t('gridView')}
      size={size}
      iconSize={iconSize}
      onClick={() => toggleView.mutate()}
    />
  );

  return (
    <>
      {/* Desktop: Keep-web bar (hamburger, logo, search field, actions). */}
      <header className="fixed inset-x-0 top-0 z-30 hidden h-(--topbar-h) items-center gap-1 border-b border-(--outline-variant) bg-surface px-2 md:flex">
        <IconButton svg={menuSvg} label={t('mainMenu')} onClick={toggleSidebar} />

        <Link to="/" className="flex shrink-0 items-center gap-1 rounded px-1 outline-(--primary)">
          <img src="/favicon.svg" alt="" className="h-10 w-10 p-1" />
          <span className="hidden text-[22px] leading-none text-on-surface-variant md:inline">
            {t('common:appName')}
          </span>
        </Link>

        <search className="mx-2 min-w-0 max-w-[720px] flex-1 sm:mx-4">
          <div className="search-elevated flex h-12 items-center rounded-lg bg-surface-container transition-shadow duration-150">
            <IconButton
              svg={searchSvg}
              label={t('searchPlaceholder')}
              iconSize={22}
              onClick={() => goSearch(searchValue)}
            />
            <input
              type="text"
              value={searchValue}
              placeholder={t('searchPlaceholder')}
              className="h-full w-full min-w-0 bg-transparent pr-2 text-base text-on-surface outline-none placeholder:text-on-surface-variant"
              onFocus={() => {
                if (!onSearchRoute) goSearch('');
              }}
              onChange={(e) => goSearch(e.target.value)}
            />
            {onSearchRoute && (
              <IconButton
                svg={closeSvg}
                label={t('clearSearch')}
                iconSize={20}
                onClick={() => void navigate({ to: '/' })}
              />
            )}
          </div>
        </search>

        <div className="ml-auto flex items-center gap-1">
          <SyncButton />
          {sortable && <SortMenu />}
          {viewToggleButton()}
          <SettingsMenu />
          <div className="ml-1 mr-2">
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Mobile: Keep-Android pill — hamburger, hint, view toggle and avatar in
          one rounded search bar; on /search it becomes the live input. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-(--topbar-h) items-center bg-surface px-3 md:hidden">
        <div className="flex h-12 w-full min-w-0 items-center rounded-full bg-surface-container pr-2 pl-0.5">
          {onSearchRoute ? (
            <>
              <IconButton
                svg={arrowBackSvg}
                label={t('common:back')}
                size={44}
                iconSize={22}
                onClick={() => void navigate({ to: '/' })}
              />
              <input
                type="text"
                value={searchValue}
                placeholder={t('searchYourNotes')}
                // biome-ignore lint/a11y/noAutofocus: opening the search screen focuses the query field (Keep app behavior)
                autoFocus
                className="h-full w-full min-w-0 bg-transparent text-[0.95rem] text-on-surface outline-none placeholder:text-on-surface-variant"
                onChange={(e) => goSearch(e.target.value)}
              />
              {searchValue !== '' && (
                <IconButton
                  svg={closeSvg}
                  label={t('clearSearch')}
                  size={40}
                  iconSize={20}
                  onClick={() => goSearch('')}
                />
              )}
            </>
          ) : (
            <>
              <IconButton
                svg={menuSvg}
                label={t('mainMenu')}
                size={44}
                iconSize={22}
                onClick={() => setDrawerOpen(true)}
              />
              <button
                type="button"
                className="h-full min-w-0 flex-1 truncate px-1 text-left text-[0.95rem] text-on-surface-variant outline-none"
                onClick={() => goSearch('')}
              >
                {t('searchYourNotes')}
              </button>
              {sortable && <SortMenu size={44} iconSize={22} />}
              {viewToggleButton(44, 22)}
              <div className="ml-1">
                <AccountMenu />
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
}

/**
 * Keep-web refresh: the arrow becomes a spinner while queries refetch, then a
 * cloud-done check for a beat before settling back to the arrow.
 */
function SyncButton() {
  const { t } = useTranslation('shell');
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'done'>('idle');
  const timerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const refresh = () => {
    if (phase !== 'idle') return;
    setPhase('syncing');
    const started = Date.now();
    void queryClient.invalidateQueries().finally(() => {
      // The spinner must be seen even when the refetch is near-instant.
      const wait = Math.max(0, 650 - (Date.now() - started));
      timerRef.current = window.setTimeout(() => {
        setPhase('done');
        timerRef.current = window.setTimeout(() => setPhase('idle'), 1400);
      }, wait);
    });
  };

  return (
    <IconButton
      svg={phase === 'syncing' ? progressActivitySvg : phase === 'done' ? cloudDoneSvg : refreshSvg}
      label={t('refresh')}
      className={
        phase === 'syncing' ? '[&_.msym]:animate-spin motion-reduce:[&_.msym]:animate-none' : ''
      }
      onClick={refresh}
    />
  );
}
