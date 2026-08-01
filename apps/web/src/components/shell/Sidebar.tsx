import archiveSvg from '@material-symbols/svg-700/outlined/archive.svg?raw';
import bookmarkSvg from '@material-symbols/svg-700/outlined/bookmark.svg?raw';
import deleteSvg from '@material-symbols/svg-700/outlined/delete.svg?raw';
import editSvg from '@material-symbols/svg-700/outlined/edit.svg?raw';
import labelSvg from '@material-symbols/svg-700/outlined/label.svg?raw';
import lightbulbSvg from '@material-symbols/svg-700/outlined/lightbulb.svg?raw';
import noteStackSvg from '@material-symbols/svg-700/outlined/note_stack.svg?raw';
import notificationsSvg from '@material-symbols/svg-700/outlined/notifications.svg?raw';
import settingsSvg from '@material-symbols/svg-700/outlined/settings.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMountTransition } from '../../hooks/use-mount-transition.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { selectHasTemplates } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';
import { savedSearchTarget } from '../../lib/saved-searches.js';
import { useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';
import { LabelDot } from '../labels/LabelStyleMenu.js';

interface NavItem {
  to: string;
  svg: string;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', svg: lightbulbSvg, labelKey: 'navNotes' },
  { to: '/reminders', svg: notificationsSvg, labelKey: 'navReminders' },
  { to: '/archive', svg: archiveSvg, labelKey: 'navArchive' },
  { to: '/trash', svg: deleteSvg, labelKey: 'navTrash' },
];

/** Templates earn their row: the shelf appears once there is one on it. */
const TEMPLATES_ITEM: NavItem = { to: '/templates', svg: noteStackSvg, labelKey: 'navTemplates' };

/**
 * Keep sidebar: persistent expanded ↔ icon rail, with Gmail-style hover
 * slide-out (overlay, no content reflow) while collapsed. On mobile it is the
 * Keep-Android drawer instead: full height over the top bar, app header,
 * labels section and a Settings entry (the mobile bar has no gear).
 */
export function Sidebar() {
  const { t } = useTranslation('shell');
  const open = useUiStore((s) => s.sidebarOpen);
  const drawerOpen = useUiStore((s) => s.mobileDrawerOpen);
  const setDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const { data: labels } = useQuery(labelsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const { data: hasTemplates } = useQuery({ ...notesQuery, select: selectHasTemplates });
  const savedSearches = settings?.savedSearches ?? [];
  const [hovered, setHovered] = useState(false);

  // The drawer outlives `drawerOpen` by one slide-out (Keep-app motion), so
  // rendering and the expanded layout follow `drawerMounted` — otherwise the
  // labels and section headers would vanish mid-slide.
  const { mounted: drawerMounted, entered: drawerEntered } = useMountTransition(drawerOpen, 210);
  const expanded = open || hovered || drawerMounted;
  const overlay = !open && hovered;
  const closeDrawer = () => setDrawerOpen(false);

  // The mobile drawer is a modal surface: Esc dismisses it like the scrim tap.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  const itemClass = (isExpanded: boolean) =>
    `flex h-12 items-center text-on-surface text-sm font-medium outline-none ${
      isExpanded
        ? 'gap-8 pl-6 max-md:mx-3 max-md:rounded-full md:mr-3 md:rounded-r-full'
        : 'mx-3 w-12 justify-center rounded-full'
    } hover:bg-(--surface-hover) focus-visible:bg-(--surface-hover)`;

  return (
    <>
      {drawerMounted && (
        // biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss is a pointer affordance; Esc handled by the drawer
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users dismiss the drawer with Esc, not the scrim
        <div
          className="motion-scrim fixed inset-0 z-40 bg-(--scrim) md:hidden"
          data-entered={drawerEntered || undefined}
          onClick={closeDrawer}
        />
      )}
      <nav
        aria-label={t('mainMenu')}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        data-entered={drawerEntered || undefined}
        className={`fixed top-0 bottom-0 left-0 z-40 overflow-y-auto overflow-x-hidden bg-surface pt-2 transition-[width] duration-150 max-md:rounded-r-2xl md:top-(--topbar-h) md:z-20 ${
          drawerMounted
            ? 'drawer-panel block w-(--sidebar-w) shadow-(--elevation-3)'
            : 'hidden md:block'
        } ${expanded ? 'md:w-(--sidebar-w)' : 'md:w-(--rail-w)'} ${overlay ? 'md:shadow-(--elevation-2)' : ''}`}
      >
        <div className="mb-1 flex h-12 items-center gap-2 px-5 md:hidden">
          <img src="/favicon.svg" alt="" className="h-9 w-9 p-1" />
          <span className="text-[20px] leading-none text-on-surface-variant">
            {t('common:appName')}
          </span>
        </div>

        {NAV_ITEMS.slice(0, 2).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/' }}
            className={itemClass(expanded)}
            onClick={closeDrawer}
            activeProps={{
              className: 'bg-accent-container hover:bg-accent-container',
              'aria-current': 'page',
            }}
          >
            <Icon svg={item.svg} size={24} />
            {expanded && <span className="truncate">{t(item.labelKey)}</span>}
          </Link>
        ))}

        {labels && labels.length > 0 && (
          <div className="mt-2 mb-1 border-(--outline-variant) border-t px-6 pt-3 font-medium text-on-surface-variant text-xs md:hidden">
            {t('labelsSection')}
          </div>
        )}

        {labels?.map((label) => (
          <Link
            key={label.id}
            to="/label/$labelName"
            params={{ labelName: label.name }}
            className={itemClass(expanded)}
            onClick={closeDrawer}
            activeProps={{
              className: 'bg-accent-container hover:bg-accent-container',
              'aria-current': 'page',
            }}
          >
            {/* The label's own mark where the generic tag icon used to be —
                the emoji when it has one, otherwise its colour. */}
            {label.emoji || label.color !== 'default' ? (
              <span className="flex h-6 w-6 flex-none items-center justify-center">
                <LabelDot label={label} size={22} />
              </span>
            ) : (
              <Icon svg={labelSvg} size={24} />
            )}
            {expanded && <span className="truncate">{label.name}</span>}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => {
            closeDrawer();
            setActiveDialog('edit-labels');
          }}
          // `w-full` only while expanded: on the rail it would beat the item's
          // own `w-12` and push the icon off the column the links sit on.
          className={`${expanded ? 'max-md:w-[calc(100%-1.5rem)] md:w-full' : ''} ${itemClass(expanded)}`}
        >
          <Icon svg={editSvg} size={24} />
          {expanded && <span className="truncate">{t('editLabels')}</span>}
        </button>

        {savedSearches.length > 0 && (
          <div className="mt-2 mb-1 border-(--outline-variant) border-t px-6 pt-3 font-medium text-on-surface-variant text-xs md:hidden">
            {t('savedSearchesSection')}
          </div>
        )}

        {savedSearches.map((search) => (
          <Link
            key={search.id}
            to="/search"
            search={savedSearchTarget(search)}
            // The query is part of the identity here: two shortcuts differ only
            // by their search, so path-only matching would light them all up.
            activeOptions={{ includeSearch: true }}
            className={itemClass(expanded)}
            onClick={closeDrawer}
            activeProps={{
              className: 'bg-accent-container hover:bg-accent-container',
              'aria-current': 'page',
            }}
          >
            <Icon svg={bookmarkSvg} size={24} />
            {expanded && <span className="truncate">{search.name}</span>}
          </Link>
        ))}

        {[...(hasTemplates ? [TEMPLATES_ITEM] : []), ...NAV_ITEMS.slice(2)].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.to === '/' }}
            className={itemClass(expanded)}
            onClick={closeDrawer}
            activeProps={{
              className: 'bg-accent-container hover:bg-accent-container',
              'aria-current': 'page',
            }}
          >
            <Icon svg={item.svg} size={24} />
            {expanded && <span className="truncate">{t(item.labelKey)}</span>}
          </Link>
        ))}

        <div className="mt-2 border-(--outline-variant) border-t pt-2 md:hidden">
          <button
            type="button"
            onClick={() => {
              closeDrawer();
              setActiveDialog('settings');
            }}
            className={`w-[calc(100%-1.5rem)] ${itemClass(true)}`}
          >
            <Icon svg={settingsSvg} size={24} />
            <span className="truncate">{t('settings')}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
