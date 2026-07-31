import type { ShareLink } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatVersionStamp } from '../../lib/dates.js';
import { createShareLink, revokeShareLink, shareLinkQuery } from '../../lib/share-link-api.js';
import { useSnackbarStore } from '../../stores/snackbar.js';

/** Never (the default), a week, a month — a picker, not a date field. */
const EXPIRY_OPTIONS: (number | null)[] = [null, 7, 30];

/**
 * The half of the Share dialog that has no email in it: a link that hands the
 * note to whoever holds it, account or no account. One link per note, so this
 * is a switch — creating again replaces the address, which is also how it is
 * revoked in a hurry.
 */
export function PublicLinkSection({ noteId }: { noteId: string }) {
  const { t, i18n } = useTranslation('sharing');
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const { data } = useQuery(shareLinkQuery(noteId));
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);

  const setLink = (link: ShareLink) =>
    queryClient.setQueryData(shareLinkQuery(noteId).queryKey, link);

  const create = useMutation({
    mutationFn: () => createShareLink(noteId, expiresInDays),
    onSuccess: setLink,
    onError: () => show({ message: t('linkFailed') }),
  });

  const revoke = useMutation({
    mutationFn: () => revokeShareLink(noteId),
    onSuccess: () => setLink({ url: null, expiresAt: null }),
    onError: () => show({ message: t('linkFailed') }),
  });

  const url = data?.url ?? null;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    show({ message: t('linkCopied') });
  };

  const buttonClass =
    'rounded px-3 py-1.5 font-medium text-primary text-sm hover:bg-(--surface-hover) disabled:opacity-40';

  return (
    <section className="mt-4 border-(--outline-variant) border-t px-2 pt-3">
      <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
        {t('linkTitle')}
      </h3>
      <p className="py-1.5 text-on-surface-variant text-sm">{t('linkHint')}</p>

      {url === null ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={String(expiresInDays)}
            aria-label={t('linkExpiry')}
            className="rounded border border-(--outline-variant) bg-transparent px-1.5 py-1 text-on-surface-variant text-xs outline-none focus-visible:border-(--primary)"
            onChange={(e) => setExpiresInDays(e.target.value === 'null' ? null : +e.target.value)}
          >
            {EXPIRY_OPTIONS.map((days) => (
              <option key={String(days)} value={String(days)}>
                {days === null ? t('linkExpiryNever') : t('linkExpiryDays', { count: days })}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={buttonClass}
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {t('linkCreate')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            readOnly
            aria-label={t('linkUrl')}
            value={url}
            className="w-full rounded border border-(--outline-variant) bg-transparent px-2 py-1 font-mono text-on-surface text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          {data?.expiresAt && (
            <p className="text-on-surface-variant text-xs">
              {t('linkExpiresOn', { date: formatVersionStamp(data.expiresAt, i18n.language) })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={copy}>
              {t('linkCopy')}
            </button>
            <button
              type="button"
              className="rounded px-3 py-1.5 font-medium text-red-600 text-sm hover:bg-(--surface-hover) disabled:opacity-40 dark:text-red-400"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              {t('linkRevoke')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
