import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import archiveSvg from '@material-symbols/svg-400/outlined/archive.svg?raw';
import deleteForeverSvg from '@material-symbols/svg-400/outlined/delete_forever.svg?raw';
import pinSvg from '@material-symbols/svg-400/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-400/outlined/keep-fill.svg?raw';
import moreSvg from '@material-symbols/svg-400/outlined/more_vert.svg?raw';
import paletteSvg from '@material-symbols/svg-400/outlined/palette.svg?raw';
import restoreSvg from '@material-symbols/svg-400/outlined/restore_from_trash.svg?raw';
import unarchiveSvg from '@material-symbols/svg-400/outlined/unarchive.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { LabelChips } from '../labels/LabelChips.js';
import { LabelPicker } from '../labels/LabelPicker.js';
import { ColorPicker } from './ColorPicker.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { LinkPreviewChips } from './LinkPreviewChips.js';
import { NoteBackgroundArt } from './NoteBackground.js';
import { NoteBody } from './NoteBody.js';
import { NoteImages } from './NoteImages.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

export function NoteCard({ note }: { note: FullNote }) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const m = useNoteMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  const trashed = note.trashedAt !== null;

  const openEditor = () => {
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, note: note.id }),
    });
  };

  const isDefaultColor = note.color === 'default';
  const isEmpty =
    !note.title && !note.bodyHtml && note.items.length === 0 && note.attachments.length === 0;

  return (
    <div
      className="group relative flex flex-col rounded-lg border transition-shadow duration-100 hover:shadow-(--elevation-2)"
      style={{
        background: `var(--note-${note.color})`,
        borderColor: isDefaultColor ? 'var(--outline)' : 'transparent',
      }}
    >
      <NoteBackgroundArt background={note.background} />

      {!trashed && (
        <div className="absolute top-1 right-1 z-10 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100">
          <IconButton
            svg={note.pinned ? pinFilledSvg : pinSvg}
            label={note.pinned ? t('unpinNote') : t('pinNote')}
            size={38}
            iconSize={20}
            className="text-on-surface-variant"
            onClick={() => m.togglePin(note)}
          />
        </div>
      )}

      {/* biome-ignore lint/a11y/useSemanticElements: a native button cannot contain the toolbar's buttons */}
      <div
        role="button"
        tabIndex={0}
        aria-label={note.title || t('openNote')}
        onClick={openEditor}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault();
            openEditor();
          }
        }}
        className="relative min-h-[56px] cursor-default rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
      >
        <NoteImages note={note} />
        <div className="px-4 pt-3 pb-2">
          {note.title && (
            <div className="mb-1.5 break-words pr-7 font-medium text-[1rem] text-on-surface leading-6">
              {note.title}
            </div>
          )}
          {isEmpty ? (
            <div className="py-3 text-[1rem] text-on-surface-variant">{t('emptyNote')}</div>
          ) : (
            <NoteBody note={note} />
          )}
        </div>
      </div>

      <LinkPreviewChips note={note} />
      <LabelChips note={note} />

      <div className="relative flex h-[38px] items-center gap-0.5 px-1.5 pb-0.5 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100">
        {trashed ? (
          <>
            <IconButton
              svg={deleteForeverSvg}
              label={t('trash:deleteForever')}
              size={34}
              iconSize={18}
              className="text-on-surface-variant"
              onClick={() => setConfirmDelete(true)}
            />
            <IconButton
              svg={restoreSvg}
              label={t('trash:restore')}
              size={34}
              iconSize={18}
              className="text-on-surface-variant"
              onClick={() => m.restoreWithUndo(note)}
            />
          </>
        ) : (
          <>
            <Popover.Root>
              <Popover.Trigger
                aria-label={t('backgroundOptions')}
                title={t('backgroundOptions')}
                className={iconButtonClass}
                style={{ width: 34, height: 34 }}
              >
                <Icon svg={paletteSvg} size={18} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className="z-50" sideOffset={4}>
                  <Popover.Popup className="z-40 rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                    <ColorPicker
                      color={note.color}
                      background={note.background}
                      onColor={(color) => m.patchState.mutate({ id: note.id, patch: { color } })}
                      onBackground={(background) =>
                        m.patchState.mutate({ id: note.id, patch: { background } })
                      }
                    />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            <IconButton
              svg={note.archived ? unarchiveSvg : archiveSvg}
              label={note.archived ? t('unarchiveNote') : t('shell:navArchive')}
              size={34}
              iconSize={18}
              className="text-on-surface-variant"
              onClick={() => (note.archived ? m.unarchiveWithUndo(note) : m.archiveWithUndo(note))}
            />

            <Menu.Root>
              <Menu.Trigger
                aria-label={t('more')}
                title={t('more')}
                className={iconButtonClass}
                style={{ width: 34, height: 34 }}
              >
                <Icon svg={moreSvg} size={18} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-50" sideOffset={2}>
                  <Menu.Popup className="z-40 min-w-44 rounded-lg border border-(--outline-variant) bg-surface py-1.5 shadow-(--elevation-3)">
                    <Menu.Item className={menuItemClass} onClick={() => m.trashWithUndo(note)}>
                      {t('deleteNote')}
                    </Menu.Item>
                    <Menu.Item className={menuItemClass} onClick={() => setShowLabelPicker(true)}>
                      {note.labelIds.length > 0 ? t('labels:changeLabels') : t('labels:addLabel')}
                    </Menu.Item>
                    <Menu.Item className={menuItemClass} onClick={() => m.copy.mutate(note.id)}>
                      {t('makeACopy')}
                    </Menu.Item>
                    <Menu.Item
                      className={menuItemClass}
                      onClick={() =>
                        m.convert.mutate({
                          id: note.id,
                          to: note.type === 'list' ? 'text' : 'list',
                        })
                      }
                    >
                      {note.type === 'list'
                        ? t('editor:hideCheckboxes')
                        : t('editor:showCheckboxes')}
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        text={t('trash:confirmDeleteForever')}
        confirmLabel={t('common:delete')}
        onConfirm={() => m.deleteForever.mutate(note.id)}
      />

      {showLabelPicker && (
        <Popover.Root open onOpenChange={(o) => !o && setShowLabelPicker(false)}>
          <Popover.Trigger
            className="absolute bottom-2 left-2 h-px w-px opacity-0"
            aria-hidden
            tabIndex={-1}
          />
          <Popover.Portal>
            <Popover.Positioner className="z-40" sideOffset={2}>
              <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                <LabelPicker note={note} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
