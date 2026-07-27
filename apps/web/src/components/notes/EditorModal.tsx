import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import archiveSvg from '@material-symbols/svg-400/outlined/archive.svg?raw';
import formatSvg from '@material-symbols/svg-400/outlined/format_color_text.svg?raw';
import pinSvg from '@material-symbols/svg-400/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-400/outlined/keep-fill.svg?raw';
import moreSvg from '@material-symbols/svg-400/outlined/more_vert.svg?raw';
import paletteSvg from '@material-symbols/svg-400/outlined/palette.svg?raw';
import redoSvg from '@material-symbols/svg-400/outlined/redo.svg?raw';
import undoSvg from '@material-symbols/svg-400/outlined/undo.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAutosave } from '../../hooks/use-autosave.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { formatCreatedTooltip, formatEdited } from '../../lib/dates.js';
import { notesQuery } from '../../lib/notes-api.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { ColorPicker } from './ColorPicker.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { NoteBackgroundArt } from './NoteBackground.js';
import { VersionHistoryDialog } from './VersionHistoryDialog.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

/** Route-driven editor: open when ?note=<id> is present on any shell route. */
export function EditorModal() {
  const search = useSearch({ strict: false }) as { note?: string };
  const navigate = useNavigate();
  const noteId = search.note;

  const close = () => {
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, note: undefined }),
    });
  };

  if (!noteId) return null;
  return <EditorDialog key={noteId} noteId={noteId} onClose={close} />;
}

function EditorDialog({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation('editor');
  const m = useNoteMutations();
  const { data: notes, isSuccess } = useQuery(notesQuery);
  const note = notes?.find((n) => n.id === noteId);

  // Deep link to a nonexistent/foreign note: close once the corpus is loaded.
  useEffect(() => {
    if (isSuccess && !note) onClose();
  }, [isSuccess, note, onClose]);

  if (!note) return null;
  return <EditorBody note={note} onClose={onClose} t={t} lang={i18n.language} m={m} />;
}

function EditorBody({
  note,
  onClose,
  t,
  lang,
  m,
}: {
  note: FullNote;
  onClose: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
  lang: string;
  m: ReturnType<typeof useNoteMutations>;
}) {
  const trashed = note.trashedAt !== null;
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  const noteIdRef = useRef(note.id);
  const autosave = useAutosave((patch) => {
    m.patchContent.mutate({ id: noteIdRef.current, patch });
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      Placeholder.configure({ placeholder: t('notePlaceholder') }),
    ],
    content: note.bodyHtml,
    editable: !trashed,
    onUpdate: ({ editor: ed }) => {
      autosave.markDirty('bodyHtml', ed.getHTML());
    },
  });

  const flushAndClose = () => {
    autosave.flush();
    onClose();
  };

  const isDefaultColor = note.color === 'default';

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) flushAndClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-(--scrim)" />
        <Dialog.Popup
          aria-label={note.title || t('notePlaceholder')}
          className="-translate-x-1/2 fixed top-[8vh] left-1/2 z-40 flex max-h-[84vh] w-[min(96vw,600px)] flex-col rounded-lg border shadow-(--elevation-3) outline-none"
          style={{
            background: `var(--note-${note.color})`,
            borderColor: isDefaultColor ? 'var(--outline-variant)' : 'transparent',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
              e.preventDefault();
              e.stopPropagation();
              flushAndClose();
            }
          }}
        >
          <NoteBackgroundArt background={note.background} />

          <div className="flex items-start">
            <textarea
              ref={titleRef}
              defaultValue={note.title}
              placeholder={t('titlePlaceholder')}
              aria-label={t('titlePlaceholder')}
              rows={1}
              maxLength={999}
              readOnly={trashed}
              onChange={(e) => {
                autosave.markDirty('title', e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              className="w-full resize-none bg-transparent px-4 pt-4 pb-2 font-medium text-[1.375rem] text-on-surface leading-7 outline-none placeholder:text-on-surface-variant"
            />
            {!trashed && (
              <div className="pt-2.5 pr-2">
                <IconButton
                  svg={note.pinned ? pinFilledSvg : pinSvg}
                  label={note.pinned ? t('notes:unpinNote') : t('notes:pinNote')}
                  size={40}
                  iconSize={22}
                  className="text-on-surface-variant"
                  onClick={() => m.togglePin(note)}
                />
              </div>
            )}
          </div>

          <div className="min-h-[46px] flex-1 overflow-y-auto px-4 pb-3">
            <EditorContent editor={editor} className="note-editor" />
          </div>

          <div className="px-4 pb-1 text-right">
            <span
              className="cursor-default text-on-surface-variant text-xs"
              title={formatCreatedTooltip(note.createdAt, lang)}
            >
              {t('edited', { time: formatEdited(note.updatedAt, lang) })}
            </span>
          </div>

          {showFormatBar && !trashed && editor && (
            <div className="flex items-center gap-0.5 border-(--outline-variant) border-t px-2 py-1">
              <FormatButton
                label={t('formatH1')}
                active={editor.isActive('heading', { level: 1 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              >
                H1
              </FormatButton>
              <FormatButton
                label={t('formatH2')}
                active={editor.isActive('heading', { level: 2 })}
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                H2
              </FormatButton>
              <FormatButton
                label={t('formatNormal')}
                active={editor.isActive('paragraph')}
                onClick={() => editor.chain().focus().setParagraph().run()}
              >
                ¶
              </FormatButton>
              <span className="mx-1 h-5 w-px bg-(--outline-variant)" />
              <FormatButton
                label={t('formatBold')}
                active={editor.isActive('bold')}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <strong>B</strong>
              </FormatButton>
              <FormatButton
                label={t('formatItalic')}
                active={editor.isActive('italic')}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <em>I</em>
              </FormatButton>
              <FormatButton
                label={t('formatUnderline')}
                active={editor.isActive('underline')}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <u>U</u>
              </FormatButton>
              <span className="mx-1 h-5 w-px bg-(--outline-variant)" />
              <FormatButton
                label={t('formatClear')}
                active={false}
                onClick={() => editor.chain().focus().unsetAllMarks().setParagraph().run()}
              >
                ⌫
              </FormatButton>
            </div>
          )}

          <div className="flex items-center gap-0.5 px-2 py-1.5">
            {trashed ? (
              <>
                <span className="pl-2 text-on-surface-variant text-sm">
                  {t('trash:noteInTrash')}
                </span>
                <button
                  type="button"
                  className="ml-auto rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)"
                  onClick={() => {
                    m.restoreWithUndo(note);
                  }}
                >
                  {t('trash:restore')}
                </button>
                <button
                  type="button"
                  className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)"
                  onClick={() => setConfirmDelete(true)}
                >
                  {t('trash:deleteForever')}
                </button>
              </>
            ) : (
              <>
                <IconButton
                  svg={formatSvg}
                  label={t('formattingOptions')}
                  size={38}
                  iconSize={19}
                  className={`text-on-surface-variant ${showFormatBar ? 'bg-(--surface-hover)' : ''}`}
                  onClick={() => setShowFormatBar((v) => !v)}
                />
                <Popover.Root>
                  <Popover.Trigger
                    aria-label={t('notes:backgroundOptions')}
                    title={t('notes:backgroundOptions')}
                    className={iconButtonClass}
                    style={{ width: 38, height: 38 }}
                  >
                    <Icon svg={paletteSvg} size={19} />
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Positioner className="z-50" sideOffset={4}>
                      <Popover.Popup className="z-50 rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                        <ColorPicker
                          color={note.color}
                          background={note.background}
                          onColor={(color) =>
                            m.patchState.mutate({ id: note.id, patch: { color } })
                          }
                          onBackground={(background) =>
                            m.patchState.mutate({ id: note.id, patch: { background } })
                          }
                        />
                      </Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </Popover.Root>
                <IconButton
                  svg={archiveSvg}
                  label={note.archived ? t('notes:unarchiveNote') : t('shell:navArchive')}
                  size={38}
                  iconSize={19}
                  className="text-on-surface-variant"
                  onClick={() => {
                    autosave.flush();
                    if (note.archived) m.unarchiveWithUndo(note);
                    else {
                      m.archiveWithUndo(note);
                      onClose();
                    }
                  }}
                />
                <Menu.Root>
                  <Menu.Trigger
                    aria-label={t('notes:more')}
                    title={t('notes:more')}
                    className={iconButtonClass}
                    style={{ width: 38, height: 38 }}
                  >
                    <Icon svg={moreSvg} size={19} />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner className="z-50" sideOffset={2}>
                      <Menu.Popup className="z-50 min-w-44 rounded-lg border border-(--outline-variant) bg-surface py-1.5 shadow-(--elevation-3)">
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => {
                            autosave.flush();
                            m.trashWithUndo(note);
                            onClose();
                          }}
                        >
                          {t('notes:deleteNote')}
                        </Menu.Item>
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => {
                            autosave.flush();
                            m.copy.mutate(note.id);
                          }}
                        >
                          {t('notes:makeACopy')}
                        </Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={() => setShowVersions(true)}>
                          {t('versionHistory')}
                        </Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
                <IconButton
                  svg={undoSvg}
                  label={t('undo')}
                  size={38}
                  iconSize={19}
                  className="text-on-surface-variant"
                  disabled={!editor?.can().undo()}
                  onClick={() => editor?.chain().focus().undo().run()}
                />
                <IconButton
                  svg={redoSvg}
                  label={t('redo')}
                  size={38}
                  iconSize={19}
                  className="text-on-surface-variant"
                  disabled={!editor?.can().redo()}
                  onClick={() => editor?.chain().focus().redo().run()}
                />
              </>
            )}
            <button
              type="button"
              onClick={flushAndClose}
              className="ml-auto rounded px-6 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
            >
              {t('common:close')}
            </button>
          </div>

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            text={t('trash:confirmDeleteForever')}
            confirmLabel={t('common:delete')}
            onConfirm={() => {
              m.deleteForever.mutate(note.id);
              onClose();
            }}
          />
          {showVersions && (
            <VersionHistoryDialog
              noteId={note.id}
              open={showVersions}
              onOpenChange={setShowVersions}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center rounded px-1.5 text-on-surface-variant text-sm hover:bg-(--surface-hover) ${
        active ? 'bg-(--surface-hover) text-on-surface' : ''
      }`}
    >
      {children}
    </button>
  );
}
