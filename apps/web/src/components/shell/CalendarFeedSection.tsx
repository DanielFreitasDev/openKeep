import type { CalendarFeed } from '@openkeep/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';
import { useSnackbarStore } from '../../stores/snackbar.js';

const calendarQuery = queryOptions({
  queryKey: ['calendar-feed'],
  queryFn: () => api<CalendarFeed>('/api/calendar/token'),
  staleTime: 60_000,
});

/**
 * Settings → the iCalendar subscription. The URL carries the secret, so it is
 * shown behind a reveal and the copy button is the intended path; rotating it
 * unsubscribes every calendar at once, which is the whole revocation story.
 */
export function CalendarFeedSection() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const { data } = useQuery(calendarQuery);
  const [revealed, setRevealed] = useState(false);

  const setUrl = (feed: CalendarFeed) => queryClient.setQueryData(calendarQuery.queryKey, feed);

  const create = useMutation({
    mutationFn: () => api<CalendarFeed>('/api/calendar/token', { method: 'POST' }),
    onSuccess: (feed) => {
      setUrl(feed);
      setRevealed(true);
    },
  });

  const revoke = useMutation({
    mutationFn: () => api<undefined>('/api/calendar/token', { method: 'DELETE' }),
    onSuccess: () => {
      setUrl({ url: null });
      setRevealed(false);
    },
  });

  const url = data?.url ?? null;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    show({ message: t('calendarCopied') });
  };

  return (
    <section className="mt-4">
      <h3 className="font-medium text-on-surface-variant text-xs uppercase tracking-wide">
        {t('calendarFeed')}
      </h3>
      <p className="py-2 text-on-surface-variant text-sm">{t('calendarFeedHint')}</p>

      {url === null ? (
        <button
          type="button"
          className="rounded border border-(--outline) px-3 py-1.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {t('calendarEnable')}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            readOnly
            aria-label={t('calendarUrl')}
            value={revealed ? url : url.replace(/\/[^/]+\.ics$/, '/••••••••.ics')}
            className="w-full rounded border border-(--outline) bg-transparent px-2 py-1 font-mono text-on-surface text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-(--outline) px-3 py-1.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
              onClick={copy}
            >
              {t('calendarCopy')}
            </button>
            <button
              type="button"
              className="rounded px-3 py-1.5 font-medium text-on-surface-variant text-sm hover:bg-(--surface-hover)"
              onClick={() => setRevealed((r) => !r)}
            >
              {revealed ? t('calendarHide') : t('calendarReveal')}
            </button>
            <button
              type="button"
              className="rounded px-3 py-1.5 font-medium text-on-surface-variant text-sm hover:bg-(--surface-hover)"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              {t('calendarRotate')}
            </button>
            <button
              type="button"
              className="rounded px-3 py-1.5 font-medium text-red-600 text-sm hover:bg-(--surface-hover) dark:text-red-400"
              onClick={() => revoke.mutate()}
              disabled={revoke.isPending}
            >
              {t('calendarRevoke')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
