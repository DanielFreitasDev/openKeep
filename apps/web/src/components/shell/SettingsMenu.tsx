import { Menu } from '@base-ui/react/menu';
import settingsSvg from '@material-symbols/svg-700/outlined/settings.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminMeQuery } from '../../lib/admin-api.js';
import { isDarkEffective, useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';
import { iconButtonClass } from '../IconButton.js';

const FEEDBACK_URL = 'https://github.com/DanielFreitasDev/openKeep/issues/new/choose';

const itemClass =
  'flex cursor-default select-none items-center px-4 py-2.5 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

export function SettingsMenu() {
  const { t } = useTranslation('shell');
  const theme = useUiStore((s) => s.theme);
  const toggleDarkTheme = useUiStore((s) => s.toggleDarkTheme);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const dark = isDarkEffective(theme);
  // Like labels and saved searches: the entry exists only for whoever it is
  // for — an instance with no ADMIN_EMAILS shows no sign of a panel.
  const { data: adminMe } = useQuery(adminMeQuery);

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t('settingsMenu')}
        data-tooltip={t('settingsMenu')}
        className={iconButtonClass}
        style={{ width: 48, height: 48 }}
      >
        <Icon svg={settingsSvg} size={24} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} align="end">
          <Menu.Popup className="z-50 min-w-52 rounded-lg border border-(--outline-variant) bg-surface py-2 shadow-(--elevation-3)">
            <Menu.Item className={itemClass} onClick={() => setActiveDialog('settings')}>
              {t('settings')}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={toggleDarkTheme}>
              {dark ? t('disableDarkTheme') : t('enableDarkTheme')}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={() => setActiveDialog('shortcuts')}>
              {t('keyboardShortcuts')}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={() => setActiveDialog('import-export')}>
              {t('importExport')}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={() => setActiveDialog('api-tokens')}>
              {t('apiTokens')}
            </Menu.Item>
            <Menu.Item className={itemClass} onClick={() => setActiveDialog('webhooks')}>
              {t('webhooks')}
            </Menu.Item>
            {adminMe?.admin && (
              <Menu.Item className={itemClass} onClick={() => setActiveDialog('admin')}>
                {t('administration')}
              </Menu.Item>
            )}
            <Menu.Item
              className={itemClass}
              render={<a href={FEEDBACK_URL} target="_blank" rel="noreferrer" />}
            >
              {t('sendFeedback')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
