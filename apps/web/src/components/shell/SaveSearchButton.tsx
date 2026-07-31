import { Popover } from '@base-ui/react/popover';
import bookmarkSvg from '@material-symbols/svg-700/outlined/bookmark.svg?raw';
import bookmarkAddSvg from '@material-symbols/svg-700/outlined/bookmark_add.svg?raw';
import type { SavedSearch, UserSettings } from '@openkeep/shared';
import { LIMITS, newId } from '@openkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { patchSettings, settingsQuery } from '../../lib/queries.js';
import type { SearchParams } from '../../lib/saved-searches.js';
import { findSaved, toSavedQuery } from '../../lib/saved-searches.js';
import { Icon } from '../Icon.js';

/**
 * Saving the search on screen as a sidebar shortcut. One control, two states:
 * an unsaved search offers a name, a saved one offers its removal — so the
 * shortcut is created and destroyed where it is being used, and the sidebar
 * stays a list of links (its items are navigation, like the labels').
 */
export function SaveSearchButton({ params }: { params: SearchParams }) {
  const { t } = useTranslation('search');
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const saved = settings?.savedSearches ?? [];
  const current = findSaved(saved, params);
  const full = saved.length >= LIMITS.savedSearchesPerUserMax;

  const write = useMutation({
    mutationFn: (savedSearches: SavedSearch[]) => patchSettings({ savedSearches }),
    onMutate: (savedSearches) => {
      queryClient.setQueryData(settingsQuery.queryKey, (old): UserSettings | undefined =>
        old ? { ...old, savedSearches } : undefined,
      );
    },
    onSuccess: (data) => queryClient.setQueryData(settingsQuery.queryKey, data),
  });

  if (current) {
    return (
      <button
        type="button"
        onClick={() => write.mutate(saved.filter((s) => s.id !== current.id))}
        className="inline-flex items-center gap-2 rounded-full bg-accent-container py-1.5 pr-4 pl-3 font-medium text-on-surface text-sm hover:shadow-(--elevation-2)"
      >
        <Icon svg={bookmarkSvg} size={18} />
        {t('removeSavedSearch')}
      </button>
    );
  }

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || full) return;
    write.mutate([
      ...saved,
      {
        id: newId(),
        name: trimmed.slice(0, LIMITS.savedSearchNameMax),
        q: toSavedQuery(params),
        ...(params.collaborator ? { collaborator: params.collaborator } : {}),
      },
    ]);
    setOpen(false);
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // The query is the name people expect to see offered: it is what they
        // just typed, and editing it is one selection away.
        if (next) setName(toSavedQuery(params).slice(0, LIMITS.savedSearchNameMax));
      }}
    >
      <Popover.Trigger
        disabled={full}
        data-tooltip={full ? t('savedSearchesFull') : undefined}
        className="inline-flex items-center gap-2 rounded-full bg-surface-container py-1.5 pr-4 pl-3 font-medium text-on-surface text-sm hover:shadow-(--elevation-2) disabled:opacity-50 disabled:hover:shadow-none"
      >
        <Icon svg={bookmarkAddSvg} size={18} />
        {t('saveSearch')}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-60" sideOffset={4} align="start">
          <Popover.Popup className="w-72 rounded-lg border border-(--outline-variant) bg-surface p-3 shadow-(--elevation-3)">
            <label
              htmlFor="saved-search-name"
              className="block font-medium text-on-surface-variant text-xs uppercase tracking-wide"
            >
              {t('saveSearchName')}
            </label>
            <input
              id="saved-search-name"
              // biome-ignore lint/a11y/noAutofocus: the popover exists to take this one field
              autoFocus
              value={name}
              maxLength={LIMITS.savedSearchNameMax}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              className="mt-2 w-full rounded border border-(--outline) bg-transparent px-2 py-1.5 text-on-surface text-sm outline-none focus:border-(--primary)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-3 py-1.5 font-medium text-on-surface-variant text-sm hover:bg-(--surface-hover)"
              >
                {t('common:cancel')}
              </button>
              <button
                type="button"
                disabled={!name.trim()}
                onClick={submit}
                className="rounded bg-primary px-3 py-1.5 font-medium text-on-primary text-sm disabled:opacity-50"
              >
                {t('common:save')}
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
