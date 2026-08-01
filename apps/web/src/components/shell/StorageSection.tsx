import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../lib/bytes.js';
import { storageQuery } from '../../lib/queries.js';

/** Past this share of the allowance the bar stops being decoration. */
const WARN_AT = 0.9;

/**
 * Settings → what this account costs the instance. Without a quota it is one
 * line of fact; with one it is the only place the ceiling is visible before an
 * upload hits it, which is the whole reason the section exists.
 */
export function StorageSection() {
  const { t, i18n } = useTranslation('settings');
  const { data } = useQuery(storageQuery);
  if (!data) return null;

  const used = formatBytes(data.usedBytes, i18n.language);
  const quota = data.quotaBytes;
  // Over quota is reachable without any upload: the ceiling can be lowered on
  // an instance that already has accounts, so the bar has to survive > 100%.
  const ratio = quota === null ? 0 : Math.min(1, data.usedBytes / quota);
  const tight = quota !== null && data.usedBytes / quota >= WARN_AT;

  return (
    <section className="mt-4">
      <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
        {t('storage')}
      </h3>
      {quota === null ? (
        <p className="py-2 text-on-surface-variant text-sm">{t('storageUsed', { used })}</p>
      ) : (
        <div className="py-2">
          <p className={`text-sm ${tight ? 'text-red-600 dark:text-red-400' : 'text-on-surface'}`}>
            {t('storageUsedOf', { used, quota: formatBytes(quota, i18n.language) })}
          </p>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-(--surface-variant)"
            role="progressbar"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('storage')}
          >
            <div
              className={`h-full rounded-full ${tight ? 'bg-red-600 dark:bg-red-400' : 'bg-(--primary)'}`}
              style={{ width: `${Math.max(ratio * 100, data.usedBytes > 0 ? 2 : 0)}%` }}
            />
          </div>
          <p className="mt-2 text-on-surface-variant text-xs">{t('storageHint')}</p>
        </div>
      )}
    </section>
  );
}
