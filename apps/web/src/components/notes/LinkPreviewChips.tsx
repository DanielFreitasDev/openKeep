import publicSvg from '@material-symbols/svg-400/outlined/public.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { extractUrls } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { fetchLinkPreview } from '../../lib/attachments-api.js';
import { settingsQuery } from '../../lib/queries.js';
import { Icon } from '../Icon.js';

function textOf(note: FullNote): string {
  const body = note.bodyHtml.replace(/<[^>]+>/g, ' ');
  return `${body} ${note.items.map((i) => i.text).join(' ')}`;
}

/** Keep's rich link chips at the bottom of cards/editor. */
export function LinkPreviewChips({ note }: { note: FullNote }) {
  const { data: settings } = useQuery(settingsQuery);
  if (!note.hasLinks || settings?.richLinkPreviews === false) return null;
  const urls = extractUrls(textOf(note), 3);
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 px-3 pb-2">
      {urls.map((url) => (
        <PreviewChip key={url} url={url} />
      ))}
    </div>
  );
}

function PreviewChip({ url }: { url: string }) {
  const { data } = useQuery({
    queryKey: ['linkPreview', url],
    queryFn: () => fetchLinkPreview(url),
    staleTime: 60 * 60 * 1000,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 2500 : false),
  });

  if (!data || data.status !== 'ok') return null;
  const domain = new URL(url).hostname.replace(/^www\./, '');

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 rounded-lg border border-(--outline-variant) bg-surface/60 px-2 py-1.5 hover:bg-(--surface-hover)"
      title={data.title ?? url}
    >
      {data.faviconUrl ? (
        <img
          src={data.faviconUrl}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          className="h-4 w-4 flex-none rounded-sm"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <Icon svg={publicSvg} size={16} className="flex-none text-on-surface-variant" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.75rem] text-on-surface leading-4">
          {data.title ?? domain}
        </span>
        <span className="block truncate text-[0.6875rem] text-on-surface-variant leading-3">
          {domain}
        </span>
      </span>
    </a>
  );
}
