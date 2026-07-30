import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import addAlertSvg from '@material-symbols/svg-700/outlined/add_alert.svg?raw';
import archiveSvg from '@material-symbols/svg-700/outlined/archive.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import pinSvg from '@material-symbols/svg-700/outlined/keep.svg?raw';
import moreSvg from '@material-symbols/svg-700/outlined/more_vert.svg?raw';
import paletteSvg from '@material-symbols/svg-700/outlined/palette.svg?raw';
import type { FullNote, NoteColor } from '@openkeep/shared';
import { NOTE_COLORS } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCollaboratorMutations } from '../../hooks/use-collaborator-mutations.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { useReminderMutations } from '../../hooks/use-reminder-mutations.js';
import { notesQuery } from '../../lib/notes-api.js';
import { useSelectionStore } from '../../stores/selection.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { BulkLabelPicker } from '../labels/LabelPicker.js';
import { ReminderPicker } from '../notes/ReminderPicker.js';
import { ShareDialog } from '../notes/ShareDialog.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

/**
 * One reminder for the whole selection. The picker only needs *a* reminder to
 * offer "Delete reminder", so it gets the first one found — deleting then
 * clears every note that has one, and setting overwrites all of them.
 */
function BulkReminderPicker({ picked }: { picked: FullNote[] }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const m = useReminderMutations();
  return (
    <>
      <Popover.Close ref={closeRef} className="hidden" />
      <ReminderPicker
        reminder={picked.find((n) => n.reminder)?.reminder ?? null}
        onApply={(body) => {
          for (const n of picked) m.set.mutate({ noteId: n.id, body });
        }}
        onDelete={() => {
          for (const n of picked) if (n.reminder) m.remove.mutate(n.id);
        }}
        onDone={() => closeRef.current?.click()}
      />
    </>
  );
}

/** Keep's multi-select top bar: replaces the top bar while N > 0. */
export function SelectionBar() {
  const { t } = useTranslation('notes');
  const selected = useSelectionStore((s) => s.selected);
  const clear = useSelectionStore((s) => s.clear);
  const { data: notes } = useQuery(notesQuery);
  const m = useNoteMutations();
  const collaboratorM = useCollaboratorMutations();
  // Panels the overflow menu opens, anchored under it (a menu item cannot own
  // a popover of its own).
  const [panel, setPanel] = useState<'labels' | 'reminder' | null>(null);
  const [showShare, setShowShare] = useState(false);

  if (selected.size === 0) return null;
  const picked = (notes ?? []).filter((n) => selected.has(n.id));
  // Only the owner may invite, so a mixed selection shares the notes it can.
  const owned = picked.filter((n) => n.role === 'owner');

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
    invite: (email: string) => {
      for (const n of owned) collaboratorM.invite.mutate({ noteId: n.id, email });
      setShowShare(false);
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
        {/* Six 48px targets do not fit a 360px phone: on mobile the reminder
            lives in the overflow menu instead. */}
        <Popover.Root>
          <Popover.Trigger
            aria-label={t('reminders:addReminder')}
            data-tooltip={t('reminders:addReminder')}
            className={`${iconButtonClass} max-md:hidden`}
            style={{ width: 48, height: 48 }}
          >
            <Icon svg={addAlertSvg} size={22} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="z-50" sideOffset={4} align="end">
              <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                <BulkReminderPicker picked={picked} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <Popover.Root>
          <Popover.Trigger
            aria-label={t('backgroundOptions')}
            data-tooltip={t('backgroundOptions')}
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
                      data-tooltip={t(`color_${c}`)}
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
            data-tooltip={t('more')}
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
                <Menu.Item
                  className={`${menuItemClass} md:hidden`}
                  onClick={() => setPanel('reminder')}
                >
                  {t('reminders:addReminder')}
                </Menu.Item>
                <Menu.Item className={menuItemClass} onClick={() => setPanel('labels')}>
                  {t('labels:changeLabels')}
                </Menu.Item>
                {owned.length > 0 && (
                  <Menu.Item className={menuItemClass} onClick={() => setShowShare(true)}>
                    {t('sharing:collaborator')}
                  </Menu.Item>
                )}
                <Menu.Item className={menuItemClass} onClick={bulk.copy}>
                  {t('makeACopy')}
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {panel && (
        <Popover.Root open onOpenChange={(o) => !o && setPanel(null)}>
          {/* Anchored under the "more" button the item was picked from. */}
          <Popover.Trigger
            className="absolute top-full right-2 h-px w-px opacity-0"
            aria-hidden
            tabIndex={-1}
          />
          <Popover.Portal>
            <Popover.Positioner className="z-50" sideOffset={2} align="end">
              <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                {panel === 'labels' ? (
                  <BulkLabelPicker notes={picked} />
                ) : (
                  <BulkReminderPicker picked={picked} />
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}

      {showShare && (
        <ShareDialog
          open
          onOpenChange={setShowShare}
          collaborators={[]}
          isOwner
          subtitle={t('sharing:shareCount', { count: owned.length })}
          inviting={collaboratorM.invite.isPending}
          onInvite={bulk.invite}
          onRemove={() => {}}
        />
      )}
    </div>
  );
}
