import cloudOffSvg from '@material-symbols/svg-700/outlined/cloud_off.svg?raw';
import { useTranslation } from 'react-i18next';
import { useIsOnline } from '../../hooks/use-online.js';
import { Icon } from '../Icon.js';

/** Floating pill under the top bar while the browser reports no connectivity. */
export function OfflineBanner() {
  const { t } = useTranslation('common');
  const online = useIsOnline();

  if (online) return null;
  return (
    <div
      role="status"
      className="-translate-x-1/2 fixed top-[calc(var(--topbar-h)+8px)] left-1/2 z-40 flex items-center gap-2 rounded-full bg-[#202124] py-2 pr-4 pl-3 text-[#e8eaed] text-sm shadow-(--elevation-2) dark:bg-[#e8eaed] dark:text-[#202124]"
    >
      <Icon svg={cloudOffSvg} size={16} />
      <span>{t('offline')}</span>
    </div>
  );
}
