import archiveSvg from '@material-symbols/svg-400/outlined/archive.svg?raw';
import deleteSvg from '@material-symbols/svg-400/outlined/delete.svg?raw';
import lightbulbSvg from '@material-symbols/svg-400/outlined/lightbulb.svg?raw';
import notificationsSvg from '@material-symbols/svg-400/outlined/notifications.svg?raw';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';

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

/**
 * Keep sidebar: persistent expanded ↔ icon rail, with Gmail-style hover
 * slide-out (overlay, no content reflow) while collapsed.
 */
export function Sidebar() {
  const { t } = useTranslation('shell');
  const open = useUiStore((s) => s.sidebarOpen);
  const [hovered, setHovered] = useState(false);

  const expanded = open || hovered;
  const overlay = !open && hovered;

  return (
    <nav
      aria-label={t('mainMenu')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed top-(--topbar-h) bottom-0 left-0 z-20 overflow-y-auto overflow-x-hidden bg-surface pt-2 transition-[width] duration-150 ${
        expanded ? 'w-(--sidebar-w)' : 'w-(--rail-w)'
      } ${overlay ? 'shadow-(--elevation-2)' : ''}`}
    >
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === '/' }}
          className={`flex h-12 items-center text-on-surface text-sm font-medium outline-none ${
            expanded ? 'mr-3 rounded-r-full pl-6 gap-8' : 'mx-3 w-12 justify-center rounded-full'
          } hover:bg-(--surface-hover) focus-visible:bg-(--surface-hover)`}
          activeProps={{
            className: 'bg-accent-container hover:bg-accent-container',
            'aria-current': 'page',
          }}
        >
          <Icon svg={item.svg} size={24} />
          {expanded && <span className="truncate">{t(item.labelKey)}</span>}
        </Link>
      ))}
    </nav>
  );
}
