import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import addAlertSvg from '@material-symbols/svg-700/outlined/add_alert.svg?raw';
import archiveSvg from '@material-symbols/svg-700/outlined/archive.svg?raw';
import checkCircleSvg from '@material-symbols/svg-700/outlined/check_circle.svg?raw';
import deleteForeverSvg from '@material-symbols/svg-700/outlined/delete_forever.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import pinSvg from '@material-symbols/svg-700/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-700/outlined/keep-fill.svg?raw';
import moreSvg from '@material-symbols/svg-700/outlined/more_vert.svg?raw';
import paletteSvg from '@material-symbols/svg-700/outlined/palette.svg?raw';
import personAddSvg from '@material-symbols/svg-700/outlined/person_add.svg?raw';
import restoreSvg from '@material-symbols/svg-700/outlined/restore_from_trash.svg?raw';
import unarchiveSvg from '@material-symbols/svg-700/outlined/unarchive.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useNavigate } from '@tanstack/react-router';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { usePrintNote } from '../../hooks/use-print-note.js';
import { downloadNoteMarkdown } from '../../lib/download-markdown.js';
import { setEditorOrigin } from '../../lib/editor-origin.js';
import { focusNoteCard, noteCardRects } from '../../lib/note-focus.js';
import { canEditContent } from '../../lib/note-permissions.js';
import { useSelectionStore } from '../../stores/selection.js';
import { useUiStore } from '../../stores/ui.js';
import type { Direction } from '../grid/focus.js';
import { nextInDirection } from '../grid/focus.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { NoteLabelChips } from '../labels/LabelChips.js';
import { NoteLabelPicker } from '../labels/LabelPicker.js';
import { ColorPicker } from './ColorPicker.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { LinkPreviewChips } from './LinkPreviewChips.js';
import { NoteBackgroundArt } from './NoteBackground.js';
import { NoteBody } from './NoteBody.js';
import { NoteFileChips } from './NoteFileChips.js';
import { NoteImages } from './NoteImages.js';
import { NoteReminderChip } from './ReminderChip.js';
import { NoteReminderPicker } from './ReminderPicker.js';
import { NoteShareDialog } from './ShareDialog.js';
import { VersionHistoryDialog } from './VersionHistoryDialog.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

/** Arrow keys steer the roving tab stop; j/k (global) stay reading order. */
const ARROWS: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** The reminder picker inside an uncontrolled popover: closes via a hidden Close. */
function ReminderPickerPop({ note }: { note: FullNote }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <Popover.Close ref={closeRef} className="hidden" />
      <NoteReminderPicker note={note} onDone={() => closeRef.current?.click()} />
    </>
  );
}

/**
 * Memoized: the grid re-renders on every measurement and every scroll step,
 * and a card only depends on its own note. Store reads are narrowed to
 * booleans for the same reason — subscribing to the selection Set itself would
 * re-render every card whenever any one of them is ticked.
 */
export const NoteCard = memo(function NoteCard({
  note,
  roving = true,
}: {
  note: FullNote;
  /** False on every card but the grid's single tab stop (see NotesGrid). */
  roving?: boolean;
}) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const m = useNoteMutations();
  const attachmentM = useAttachmentMutations();
  const printNote = usePrintNote();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toggleSelect = useSelectionStore((s) => s.toggle);
  const isSelected = useSelectionStore((s) => s.selected.has(note.id));
  const selectionActive = useSelectionStore((s) => s.selected.size > 0);
  const isFocused = useUiStore((s) => s.focusedNoteId === note.id);
  const setFocusedNoteId = useUiStore((s) => s.setFocusedNoteId);
  const isOpenInEditor = useUiStore((s) => s.openEditorNoteId === note.id);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const trashed = note.trashedAt !== null;
  /** Shared content only; pin, color, labels and reminder stay mine. */
  const canEdit = canEditContent(note);

  /**
   * Long-press (touch) toggles selection — the Keep-app gesture; mobile cards
   * carry no hover toolbar or checkbox. Any real movement cancels (scroll and
   * drag win), and the click the browser fires after the press is swallowed
   * by timestamp so it cannot also open the note.
   */
  const longPress = useRef({ timer: 0, firedAt: 0, x: 0, y: 0 });
  const cancelLongPress = () => window.clearTimeout(longPress.current.timer);
  const armLongPress = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch' || trashed) return;
    longPress.current.x = e.clientX;
    longPress.current.y = e.clientY;
    window.clearTimeout(longPress.current.timer);
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.firedAt = Date.now();
      navigator.vibrate?.(10);
      toggleSelect(note.id);
    }, 450);
  };
  const trackLongPress = (e: React.PointerEvent) => {
    if (
      Math.abs(e.clientX - longPress.current.x) > 10 ||
      Math.abs(e.clientY - longPress.current.y) > 10
    )
      cancelLongPress();
  };
  const justLongPressed = () => Date.now() - longPress.current.firedAt < 700;

  const openEditor = () => {
    if (justLongPressed()) return;
    if (selectionActive) {
      toggleSelect(note.id);
      return;
    }
    // The editor morphs open from this card's rect (the masonry wrapper owns
    // the real footprint, the card root is its only child).
    const source = rootRef.current?.closest('[data-note-id]') ?? rootRef.current;
    if (source) setEditorOrigin(note.id, source.getBoundingClientRect());
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, note: note.id }),
      // Opening a note is not a page change: keep the grid where the user left it.
      resetScroll: false,
    });
  };

  const isDefaultColor = note.color === 'default';
  const isEmpty =
    !note.title && !note.bodyHtml && note.items.length === 0 && note.attachments.length === 0;

  return (
    <div
      ref={rootRef}
      data-selected={isSelected || undefined}
      data-editor-open={isOpenInEditor || undefined}
      className={`group relative flex flex-col rounded-lg border transition-shadow duration-100 hover:shadow-(--elevation-2) max-md:select-none max-md:rounded-xl ${
        isSelected ? 'ring-2 ring-(--on-surface)' : isFocused ? 'ring-2 ring-(--primary)' : ''
      }`}
      style={{
        background: `var(--note-${note.color})`,
        borderColor: isDefaultColor ? 'var(--outline)' : 'transparent',
      }}
    >
      {!trashed && (
        <div
          className={`absolute -top-2 -left-2 z-20 transition-opacity duration-100 max-md:hidden ${
            isSelected || selectionActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <IconButton
            svg={checkCircleSvg}
            label={isSelected ? t('deselectNote') : t('selectNote')}
            size={28}
            iconSize={22}
            className={`rounded-full bg-surface ${isSelected ? 'text-on-surface' : 'text-on-surface-variant'}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(note.id);
            }}
          />
        </div>
      )}
      <NoteBackgroundArt background={note.background} />

      {!trashed && (
        <div className="absolute top-1 right-1 z-10 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 max-md:hidden">
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
        tabIndex={roving ? 0 : -1}
        aria-label={note.title || t('openNote')}
        onClick={openEditor}
        // Tab into the grid adopts the tab stop; a mouse click must not, or
        // every closed editor would leave its card wearing the focus ring.
        onFocus={(e) => {
          if (e.target === e.currentTarget && e.target.matches(':focus-visible'))
            setFocusedNoteId(note.id);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            openEditor();
            return;
          }
          const dir = ARROWS[e.key];
          if (dir) {
            e.preventDefault();
            const next = nextInDirection(noteCardRects(), note.id, dir);
            if (next) {
              setFocusedNoteId(next);
              focusNoteCard(next);
            }
          }
        }}
        onPointerDown={armLongPress}
        onPointerMove={trackLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={(e) => {
          if (justLongPressed()) e.preventDefault();
        }}
        className="relative min-h-[56px] cursor-default rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-(--primary) max-md:rounded-t-xl"
      >
        <NoteImages note={note} />
        <div className="px-4 pt-3 pb-2">
          {note.title && (
            <div className="mb-1.5 break-words pr-7 font-semibold text-[1.1875rem] text-on-surface leading-7 max-md:pr-0 max-md:text-[1rem] max-md:leading-6">
              {note.title}
            </div>
          )}
          {isEmpty ? (
            <div className="py-3 text-[1rem] text-on-surface-variant">{t('emptyNote')}</div>
          ) : (
            <NoteBody
              note={note}
              onToggleItem={(itemId, checked) =>
                m.toggleItem.mutate({ noteId: note.id, itemId, checked })
              }
            />
          )}
        </div>
      </div>

      <NoteFileChips note={note} />
      <LinkPreviewChips note={note} />
      <NoteReminderChip note={note} />
      <NoteLabelChips note={note} />
      {note.collaborators.length > 1 && (
        <ul className="flex gap-1 px-3 pb-1.5" aria-label={t('sharing:sharedWith')}>
          {note.collaborators.slice(0, 4).map((c) => (
            <li
              key={c.userId}
              data-tooltip={`${c.name} <${c.email}>`}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-medium text-[0.625rem] text-on-primary"
            >
              {(c.name || c.email).charAt(0).toUpperCase()}
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex h-[38px] items-center gap-0.5 px-1.5 pb-0.5 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100 max-md:hidden">
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
                aria-label={t('reminders:addReminder')}
                data-tooltip={t('reminders:addReminder')}
                className={iconButtonClass}
                style={{ width: 34, height: 34 }}
              >
                <Icon svg={addAlertSvg} size={18} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className="z-50" sideOffset={4}>
                  <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                    <ReminderPickerPop note={note} />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            <IconButton
              svg={personAddSvg}
              label={t('sharing:collaborator')}
              size={34}
              iconSize={18}
              className="text-on-surface-variant"
              onClick={() => setShowShare(true)}
            />
            <Popover.Root>
              <Popover.Trigger
                aria-label={t('backgroundOptions')}
                data-tooltip={t('backgroundOptions')}
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

            {canEdit && (
              <>
                <IconButton
                  svg={imageSvg}
                  label={t('addImage')}
                  size={34}
                  iconSize={18}
                  className="text-on-surface-variant"
                  onClick={() => fileInputRef.current?.click()}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) attachmentM.upload.mutate({ noteId: note.id, file });
                    e.target.value = '';
                  }}
                />
              </>
            )}

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
                data-tooltip={t('more')}
                className={iconButtonClass}
                style={{ width: 34, height: 34 }}
              >
                <Icon svg={moreSvg} size={18} />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner className="z-50" sideOffset={2}>
                  <Menu.Popup className="z-40 min-w-44 rounded-lg border border-(--outline-variant) bg-surface py-1.5 shadow-(--elevation-3)">
                    {canEdit && (
                      <Menu.Item className={menuItemClass} onClick={() => m.trashWithUndo(note)}>
                        {t('deleteNote')}
                      </Menu.Item>
                    )}
                    <Menu.Item className={menuItemClass} onClick={() => setShowLabelPicker(true)}>
                      {note.labelIds.length > 0 ? t('labels:changeLabels') : t('labels:addLabel')}
                    </Menu.Item>
                    <Menu.Item className={menuItemClass} onClick={() => m.copy.mutate(note.id)}>
                      {t('makeACopy')}
                    </Menu.Item>
                    <Menu.Item className={menuItemClass} onClick={() => setShowVersions(true)}>
                      {t('editor:versionHistory')}
                    </Menu.Item>
                    <Menu.Item className={menuItemClass} onClick={() => downloadNoteMarkdown(note)}>
                      {t('editor:downloadMarkdown')}
                    </Menu.Item>
                    <Menu.Item className={menuItemClass} onClick={() => printNote(note)}>
                      {t('editor:print')}
                    </Menu.Item>
                    {canEdit && (
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
                    )}
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

      {showShare && <NoteShareDialog note={note} open={showShare} onOpenChange={setShowShare} />}

      {showVersions && (
        <VersionHistoryDialog
          noteId={note.id}
          open={showVersions}
          onOpenChange={setShowVersions}
          canRestore={canEdit}
        />
      )}

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
                <NoteLabelPicker note={note} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
});
