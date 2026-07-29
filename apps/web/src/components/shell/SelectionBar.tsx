import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import archiveSvg from '@material-symbols/svg-500/outlined/archive.svg?raw';
import closeSvg from '@material-symbols/svg-500/outlined/close.svg?raw';
import pinSvg from '@material-symbols/svg-500/outlined/keep.svg?raw';
import moreSvg from '@material-symbols/svg-500/outlined/more_vert.svg?raw';
import paletteSvg from '@material-symbols/svg-500/outlined/palette.svg?raw';
import type { NoteColor } from '@openkeep/shared';
import { NOTE_COLORS } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { notesQuery } from '../../lib/notes-api.js';
import { useSelectionStore } from '../../stores/selection.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

/** Keep's multi-select top bar: replaces the top bar while N > 0. */
export function SelectionBar() {
  const { t } = useTranslation('notes');
  const selected = useSelectionStore((s) => s.selected);
  const clear = useSelectionStore((s) => s.clear);
  const { data: notes } = useQuery(notesQuery);
  const m = useNoteMutations();

  if (selected.size === 0) return null;
  const picked = (notes ?? []).filter((n) => selected.has(n.id));

  const bulk = {
    pin: () => {
      const allPinned = picked.every((n) => n.pinned);
      for (const n of picked)
        m.patchState.mutate({ id: n.id, patch: { pinned: !allPinned, archived: false } });
      clear();
    },
    color: (color: NoteColor) => {
      for (const n of picked) m.patchState.mutate({ id: n.id, patch: { color } });
    },
    archive: () => {
      for (const n of picked)
        m.patchState.mutate({ id: n.id, patch: { archived: true, pinned: false } });
      clear();
    },
    trash: () => {
      const ids = picked.map((n) => n.id);
      clear();
      m.trashManyWithUndo(ids);
    },
    copy: () => {
      for (const n of picked) m.copy.mutate(n.id);
      clear();
    },
  };

  return (
    <div
      data-testid="selection-bar"
      className="fixed inset-x-0 top-0 z-40 flex h-(--topbar-h) items-center gap-1 border-b border-(--outline-variant) bg-surface px-2 shadow-(--elevation-2)"
    >
      <IconButton svg={closeSvg} label={t('clearSelection')} onClick={clear} />
      <span className="ml-1 font-medium text-lg text-on-surface">
        {t('selectedCount', { count: selected.size })}
      </span>
      <div className="ml-auto flex items-center gap-1 pr-1">
        <IconButton svg={pinSvg} label={t('pinNote')} onClick={bulk.pin} />
        <Popover.Root>
          <Popover.Trigger
            aria-label={t('backgroundOptions')}
            title={t('backgroundOptions')}
            className={iconButtonClass}
            style={{ width: 48, height: 48 }}
          >
            <Icon svg={paletteSvg} size={22} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="z-50" sideOffset={4} align="end">
              <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface p-2 shadow-(--elevation-3)">
                <div className="flex max-w-56 flex-wrap gap-1.5">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={t(`color_${c}`)}
                      title={t(`color_${c}`)}
                      className="h-8 w-8 rounded-full border border-(--outline) transition-transform hover:scale-110"
                      style={{ background: `var(--note-${c})` }}
                      onClick={() => bulk.color(c)}
                    />
                  ))}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <IconButton svg={archiveSvg} label={t('shell:navArchive')} onClick={bulk.archive} />
        <Menu.Root>
          <Menu.Trigger
            aria-label={t('more')}
            title={t('more')}
            className={iconButtonClass}
            style={{ width: 48, height: 48 }}
          >
            <Icon svg={moreSvg} size={22} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={2} align="end">
              <Menu.Popup className="min-w-44 rounded-lg border border-(--outline-variant) bg-surface py-1.5 shadow-(--elevation-3)">
                <Menu.Item className={menuItemClass} onClick={bulk.trash}>
                  {t('deleteNote')}
                </Menu.Item>
                <Menu.Item className={menuItemClass} onClick={bulk.copy}>
                  {t('makeACopy')}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </div>
  );
}
