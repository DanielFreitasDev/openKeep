import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import addAlertSvg from '@material-symbols/svg-700/outlined/add_alert.svg?raw';
import addBoxSvg from '@material-symbols/svg-700/outlined/add_box.svg?raw';
import archiveSvg from '@material-symbols/svg-700/outlined/archive.svg?raw';
import arrowBackSvg from '@material-symbols/svg-700/outlined/arrow_back.svg?raw';
import brushSvg from '@material-symbols/svg-700/outlined/brush.svg?raw';
import checkboxSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import checkboxBlankSvg from '@material-symbols/svg-700/outlined/check_box_outline_blank.svg?raw';
import contentCopySvg from '@material-symbols/svg-700/outlined/content_copy.svg?raw';
import deleteSvg from '@material-symbols/svg-700/outlined/delete.svg?raw';
import deleteSweepSvg from '@material-symbols/svg-700/outlined/delete_sweep.svg?raw';
import formatSvg from '@material-symbols/svg-700/outlined/format_color_text.svg?raw';
import historySvg from '@material-symbols/svg-700/outlined/history.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import pinSvg from '@material-symbols/svg-700/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-700/outlined/keep-fill.svg?raw';
import labelSvg from '@material-symbols/svg-700/outlined/label.svg?raw';
import moreSvg from '@material-symbols/svg-700/outlined/more_vert.svg?raw';
import paletteSvg from '@material-symbols/svg-700/outlined/palette.svg?raw';
import personAddSvg from '@material-symbols/svg-700/outlined/person_add.svg?raw';
import photoCameraSvg from '@material-symbols/svg-700/outlined/photo_camera.svg?raw';
import redoSvg from '@material-symbols/svg-700/outlined/redo.svg?raw';
import shareSvg from '@material-symbols/svg-700/outlined/share.svg?raw';
import undoSvg from '@material-symbols/svg-700/outlined/undo.svg?raw';
import { type FullNote, htmlToPlainText, LIMITS } from '@openkeep/shared';
import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { useAutosave } from '../../hooks/use-autosave.js';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { formatCreatedTooltip, formatEdited } from '../../lib/dates.js';
import { takeEditorOrigin } from '../../lib/editor-origin.js';
import { noteMutationKeys } from '../../lib/note-mutation-defaults.js';
import { removeNote } from '../../lib/note-selectors.js';
import { deleteNoteForever, notesQuery, trashNote } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';
import { noteExtensions } from '../../lib/tiptap.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { useUiStore } from '../../stores/ui.js';
import { BottomSheet, SheetItem } from '../BottomSheet.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { NoteLabelChips } from '../labels/LabelChips.js';
import { NoteLabelPicker } from '../labels/LabelPicker.js';
import type { ChecklistHandle } from './ChecklistEditor.js';
import { ChecklistEditor } from './ChecklistEditor.js';
import { ColorPicker } from './ColorPicker.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { FormatBar } from './FormatBar.js';
import { LinkPreviewChips } from './LinkPreviewChips.js';
import { NoteBackgroundArt } from './NoteBackground.js';
import { NoteImages } from './NoteImages.js';
import { NoteReminderChip } from './ReminderChip.js';
import { NoteReminderPicker } from './ReminderPicker.js';
import { NoteShareDialog } from './ShareDialog.js';
import { VersionHistoryDialog } from './VersionHistoryDialog.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

const EMPTY_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

type MobileSheet = 'add' | 'palette' | 'more' | 'reminder' | 'labels' | null;

/** Morph only for the desktop modal (mobile is full-screen) with motion allowed. */
function isDesktopMorph(): boolean {
  return (
    window.matchMedia('(min-width: 768px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function htmlIsBlank(html: string): boolean {
  return (
    html
      .replace(/<[^>]+>/g, '')
      .replaceAll('&nbsp;', ' ')
      .trim() === ''
  );
}

/** Body html → plain text for the Web Share sheet (server-sanitized input). */
function htmlToShareText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText;
}

/**
 * Word/character count for the body. The body cap (19,999 characters) used to
 * be invisible until a save bounced off it, so the character half switches to
 * "used / max" once the note is within 10% of the ceiling.
 */
function BodyCounts({ words, chars, lang }: { words: number; chars: number; lang: string }) {
  const { t } = useTranslation('editor');
  const max = LIMITS.noteBodyTextMax;
  const nearLimit = chars >= max * 0.9;
  return (
    <span
      className={`text-xs ${nearLimit ? 'text-red-600 dark:text-red-400' : 'text-on-surface-variant'}`}
    >
      {t('wordCount', { count: words })}
      {' · '}
      {nearLimit
        ? t('charCountLimit', { used: chars.toLocaleString(lang), max: max.toLocaleString(lang) })
        : t('charCount', { count: chars })}
    </span>
  );
}

function EditorReminderPop({ note }: { note: FullNote }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <Popover.Close ref={closeRef} className="hidden" />
      <NoteReminderPicker note={note} onDone={() => closeRef.current?.click()} />
    </>
  );
}

/** Keep-app editor chrome buttons: top-bar rounded squares, bottom-bar circles. */
function MobileAction({
  svg,
  label,
  active,
  round,
  onClick,
}: {
  svg: string;
  label: string;
  active?: boolean;
  round?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-11 w-11 flex-none items-center justify-center text-on-surface outline-none focus-visible:outline-2 focus-visible:outline-(--primary) ${
        round ? 'rounded-full' : 'rounded-xl'
      } ${active ? 'bg-accent-container' : 'bg-(--surface-hover)'}`}
    >
      <Icon svg={svg} size={20} />
    </button>
  );
}

/** Route-driven editor: open when ?note=<id> is present on any shell route. */
export function EditorModal() {
  const search = useSearch({ strict: false }) as { note?: string; new?: boolean; drawing?: string };
  const navigate = useNavigate();
  const noteId = search.note;

  const close = () => {
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, note: undefined, new: undefined }),
      resetScroll: false,
    });
  };

  // While the full-screen drawing editor is up, the note editor stands down —
  // its modal focus trap would swallow the drawing surface's pointer events.
  if (!noteId || search.drawing) return null;
  return <EditorDialog key={noteId} noteId={noteId} isNew={search.new === true} onClose={close} />;
}

function EditorDialog({
  noteId,
  isNew,
  onClose,
}: {
  noteId: string;
  isNew: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('editor');
  const m = useNoteMutations();
  const { data: notes, isSuccess } = useQuery(notesQuery);
  const note = notes?.find((n) => n.id === noteId);

  // A note created and opened in the same breath (share target, app shortcut,
  // mobile FAB) is optimistic-only until its POST acks. On a cold boot the
  // corpus fetch can resolve in that window and overwrite the optimistic row,
  // which used to read as "this note does not exist" and slam the editor shut.
  const creating = useIsMutating({
    mutationKey: noteMutationKeys.create,
    predicate: (mutation) =>
      (mutation.state.variables as { id?: string } | undefined)?.id === noteId,
  });

  // Deep link to a nonexistent/foreign note: close once the corpus is loaded.
  useEffect(() => {
    if (isSuccess && !note && creating === 0) onClose();
  }, [isSuccess, note, creating, onClose]);

  if (!note) return null;
  return (
    <EditorBody note={note} isNew={isNew} onClose={onClose} t={t} lang={i18n.language} m={m} />
  );
}

function EditorBody({
  note,
  isNew,
  onClose,
  t,
  lang,
  m,
}: {
  note: FullNote;
  isNew: boolean;
  onClose: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
  lang: string;
  m: ReturnType<typeof useNoteMutations>;
}) {
  const trashed = note.trashedAt !== null;
  const isList = note.type === 'list';
  const navigate = useNavigate();
  // Block grid/base single-char shortcuts while the editor is open.
  useKeyScope('editor', EMPTY_BINDINGS);

  // Keep's "Add drawing": the full-screen drawing editor takes over; back
  // returns here with the drawing stacked above the title.
  const openDrawing = (drawing: string) => {
    autosave.flush();
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, drawing }),
      resetScroll: false,
    });
  };
  const { data: settings } = useQuery(settingsQuery);
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [labelPicker, setLabelPicker] = useState<{ open: boolean; seed: string }>({
    open: false,
    seed: '',
  });
  const [showShare, setShowShare] = useState(false);
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const checklistRef = useRef<ChecklistHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const attachmentM = useAttachmentMutations();
  const setOpenEditorNoteId = useUiStore((s) => s.setOpenEditorNoteId);

  // The open note's card keeps its grid footprint with hidden content (Keep
  // web) — flagged before paint so the card never flashes under the morph.
  useLayoutEffect(() => {
    setOpenEditorNoteId(note.id);
    return () => setOpenEditorNoteId(null);
  }, [note.id, setOpenEditorNoteId]);

  // Morph open from the clicked card's rect (desktop; deep links skip this).
  // Base UI mounts the popup a beat after the dialog tree, so the morph runs
  // from the popup's ref callback — the moment the node lands in the DOM.
  const morphedInRef = useRef(false);
  const attachPopup = (node: HTMLDivElement | null) => {
    popupRef.current = node;
    if (!node || morphedInRef.current) return;
    morphedInRef.current = true;
    const from = takeEditorOrigin(note.id);
    if (!from || !isDesktopMorph()) return;
    const to = node.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return;
    node.animate(
      [
        {
          transformOrigin: '0 0',
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${
            from.width / to.width
          }, ${from.height / to.height})`,
        },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      { duration: 195, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  };

  /** Morph back onto the card, then run the actual close. */
  const animateClose = (after: () => void) => {
    const popup = popupRef.current;
    const from = document.querySelector(`[data-note-id="${note.id}"]`)?.getBoundingClientRect();
    if (!popup || !from || !isDesktopMorph()) {
      after();
      return;
    }
    const to = popup.getBoundingClientRect();
    popup.style.pointerEvents = 'none';
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      fill: 'forwards',
    });
    const anim = popup.animate(
      [
        { transformOrigin: '0 0', transform: 'none' },
        {
          transformOrigin: '0 0',
          transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${
            from.width / to.width
          }, ${from.height / to.height})`,
        },
      ],
      { duration: 160, easing: 'cubic-bezier(0.3, 0, 1, 1)', fill: 'forwards' },
    );
    anim.finished.catch(() => undefined).finally(after);
  };

  const noteIdRef = useRef(note.id);
  const autosave = useAutosave(
    (patch) => {
      m.patchContent.mutate({ id: noteIdRef.current, patch });
    },
    500,
    note.id,
  );

  const bodyEmptyRef = useRef(htmlIsBlank(note.bodyHtml));
  const editor = useEditor({
    // Keep's `#` quick-labeling lives in the shared extension, which also
    // knows when `#` is markdown heading syntax instead.
    extensions: noteExtensions(t('notePlaceholder'), (seed) =>
      setLabelPicker({ open: true, seed }),
    ),
    content: note.bodyHtml,
    editable: !trashed,
    // The markdown extension owns pasted plain text end to end; StarterKit's
    // own paste rules are looser (they italicize `2 * 3 * 4`) and would fire
    // on the text this one deliberately leaves alone.
    enablePasteRules: false,
    onUpdate: ({ editor: ed }) => {
      bodyEmptyRef.current = ed.isEmpty;
      autosave.markDirty('bodyHtml', ed.getHTML());
    },
    // Leaving a field commits it: the debounce is there to batch keystrokes,
    // not to keep an edit the user has visibly walked away from in limbo.
    onBlur: () => autosave.flush(),
  });

  // Counted off the plain text the server derives, so the "/ 19,999" the user
  // sees is the same number the body limit is enforced against.
  const bodyText = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? htmlToPlainText(ed.getHTML()) : ''),
  });
  const counted = isList ? note.items.map((i) => i.text).join('\n') : (bodyText ?? '');
  const trimmed = counted.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

  // After list→text conversion the (previously hidden) TipTap instance holds
  // stale content — sync it when the note flips to text and the editor is empty.
  useEffect(() => {
    if (
      !isList &&
      editor &&
      editor.isEmpty &&
      note.bodyHtml !== '' &&
      !autosave.isDirty('bodyHtml')
    ) {
      editor.commands.setContent(note.bodyHtml);
      bodyEmptyRef.current = editor.isEmpty;
    }
  }, [isList, editor, note.bodyHtml, autosave]);

  // Collaborator edits merge into the open editor, field-level LWW: only
  // non-dirty, unfocused surfaces update (dirty/focused fields win locally;
  // in-flight own PATCHes are excluded so the ack echo can't revert them).
  useEffect(() => {
    const el = titleRef.current;
    if (el && !autosave.isDirty('title') && !m.patchContent.isPending && el.value !== note.title) {
      // Dirty tracking guards typing; a focused-but-clean title merges with
      // its caret preserved (the dialog autofocuses the title on open).
      const focused = document.activeElement === el;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.value = note.title;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      if (focused) {
        const len = note.title.length;
        el.setSelectionRange(Math.min(start, len), Math.min(end, len));
      }
    }
  }, [note.title, autosave, m.patchContent.isPending]);

  useEffect(() => {
    if (
      !isList &&
      editor &&
      !autosave.isDirty('bodyHtml') &&
      !m.patchContent.isPending &&
      !editor.isFocused &&
      editor.getHTML() !== note.bodyHtml
    ) {
      editor.commands.setContent(note.bodyHtml);
      bodyEmptyRef.current = editor.isEmpty;
    }
  }, [isList, editor, note.bodyHtml, autosave, m.patchContent.isPending]);

  // A brand-new text note (mobile FAB) starts writing in the body, like Keep.
  useEffect(() => {
    if (isNew && !isList && !trashed) editor?.commands.focus('end');
  }, [isNew, isList, trashed, editor]);

  /**
   * Untouched-note discard (mobile FAB creates the note before the editor
   * opens). Emptiness reads live sources — the DOM title and TipTap's own
   * update stream — because autosave may not have flushed yet; everything
   * else comes from the freshest render of the note.
   */
  const noteSnapRef = useRef(note);
  noteSnapRef.current = note;
  const isListRef = useRef(isList);
  isListRef.current = isList;
  const discardedRef = useRef(false);

  const discardUntouched = (): boolean => {
    if (discardedRef.current || !isNew) return false;
    const n = noteSnapRef.current;
    if (n.trashedAt !== null) return false;
    const titleEmpty = (titleRef.current?.value ?? n.title).trim() === '';
    const bodyEmpty = isListRef.current
      ? n.items.every((i) => i.text.trim() === '')
      : bodyEmptyRef.current;
    const untouched =
      titleEmpty &&
      bodyEmpty &&
      n.attachments.length === 0 &&
      !n.reminder &&
      n.labelIds.length === 0;
    if (!untouched) return false;
    discardedRef.current = true;
    show({ message: t('notes:emptyNoteDiscarded') });
    const removeFromCache = () =>
      queryClient.setQueryData(notesQuery.queryKey, (old: FullNote[] | undefined) =>
        removeNote(old, n.id),
      );
    removeFromCache();
    // Delete forever requires the trash hop, and the FAB's outbox create may
    // still be in flight (a 404 only means the note has not landed yet) — so
    // trash → delete, retrying bounded. The create ack upserts the note back
    // into the cache meanwhile; remove it again once the delete sticks.
    const attempt = (tries: number) => {
      trashNote(n.id)
        .then(() => deleteNoteForever(n.id))
        .then(removeFromCache)
        .catch(() => {
          if (tries < 5) setTimeout(() => attempt(tries + 1), 800 * (tries + 1));
        });
    };
    attempt(0);
    return true;
  };

  // Android back / swipe closes by history pop (this component just unmounts),
  // so the discard must also run from unmount cleanup. A cleanup while the
  // URL still points at this note is NOT a close — that is StrictMode's dev
  // remount (or a re-key) — so only a URL that moved on counts.
  const discardRef = useRef(discardUntouched);
  discardRef.current = discardUntouched;
  useEffect(() => {
    const id = noteIdRef.current;
    return () => {
      if (new URLSearchParams(window.location.search).get('note') === id) return;
      void discardRef.current();
    };
  }, []);

  const flushAndClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (discardUntouched()) {
      onClose();
      return;
    }
    autosave.flush();
    animateClose(onClose);
  };

  const toggleArchive = () => {
    autosave.flush();
    if (note.archived) m.unarchiveWithUndo(note);
    else {
      m.archiveWithUndo(note);
      onClose();
    }
  };

  const shareNote = () => {
    const body = isList
      ? note.items.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n')
      : htmlToShareText(note.bodyHtml);
    const text = note.title ? `${note.title}\n\n${body}` : body;
    void navigator.share({ text }).catch(() => undefined);
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
        <Dialog.Backdrop
          ref={backdropRef}
          className="editor-scrim fixed inset-0 z-40 bg-(--scrim) max-md:hidden"
        />
        <Dialog.Popup
          ref={attachPopup}
          aria-label={note.title || t('notePlaceholder')}
          className="fixed inset-0 z-40 flex flex-col pt-[env(safe-area-inset-top)] outline-none md:inset-auto md:top-[8vh] md:left-1/2 md:max-h-[84vh] md:w-[min(96vw,600px)] md:-translate-x-1/2 md:rounded-lg md:border md:pt-0 md:shadow-(--elevation-3)"
          style={{
            background: `var(--note-${note.color})`,
            borderColor: isDefaultColor ? 'var(--outline-variant)' : 'transparent',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey)) {
              e.preventDefault();
              e.stopPropagation();
              flushAndClose();
            } else if (e.ctrlKey && e.shiftKey && e.key === '8' && !trashed) {
              e.preventDefault();
              m.convert.mutate({ id: note.id, to: isList ? 'text' : 'list' });
            }
          }}
        >
          <NoteBackgroundArt background={note.background} />

          {/* Mobile top bar: back + pin / reminder / archive (Keep-app chrome). */}
          <div className="flex flex-none items-center px-1.5 pt-1.5 pb-0.5 md:hidden">
            <IconButton
              svg={arrowBackSvg}
              label={t('common:back')}
              size={44}
              iconSize={22}
              className="text-on-surface"
              onClick={flushAndClose}
            />
            {!trashed && (
              <div className="ml-auto flex items-center gap-2 pr-1">
                <MobileAction
                  svg={note.pinned ? pinFilledSvg : pinSvg}
                  label={note.pinned ? t('notes:unpinNote') : t('notes:pinNote')}
                  active={note.pinned}
                  onClick={() => m.togglePin(note)}
                />
                <MobileAction
                  svg={addAlertSvg}
                  label={t('reminders:addReminder')}
                  onClick={() => setSheet('reminder')}
                />
                <MobileAction
                  svg={archiveSvg}
                  label={note.archived ? t('notes:unarchiveNote') : t('shell:navArchive')}
                  active={note.archived}
                  onClick={toggleArchive}
                />
              </div>
            )}
          </div>

          <div className="max-h-[38vh] flex-none overflow-y-auto">
            <NoteImages note={note} editable={!trashed} />
          </div>

          <div className="flex flex-none items-start">
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
              onBlur={() => autosave.flush()}
              className="w-full resize-none bg-transparent px-4 pt-4 pb-2 font-semibold text-[1.625rem] text-on-surface leading-9 outline-none placeholder:text-on-surface-variant"
            />
            {!trashed && (
              <div className="pt-2.5 pr-2 max-md:hidden">
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

          {/* biome-ignore lint/a11y/noStaticElementInteractions: tapping the empty area below the text focuses the body (mobile) */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: pointer affordance only — keyboard users are already inside the editor */}
          <div
            className="min-h-[46px] flex-1 overflow-y-auto px-4 pb-3"
            onClick={(e) => {
              if (!isList && !trashed && e.target === e.currentTarget)
                editor?.commands.focus('end');
            }}
          >
            {isList ? (
              <ChecklistEditor
                note={note}
                readOnly={trashed}
                moveCheckedToBottom={settings?.moveCheckedToBottom ?? true}
                addItemsToBottom={settings?.addItemsToBottom ?? true}
                handleRef={checklistRef}
              />
            ) : (
              <EditorContent editor={editor} className="note-editor" />
            )}
          </div>

          <LinkPreviewChips note={note} />
          <NoteReminderChip note={note} />
          <NoteLabelChips note={note} removable />

          <div className="flex items-center justify-end gap-2 px-4 pb-1 text-right max-md:hidden">
            <BodyCounts words={words} chars={counted.length} lang={lang} />
            <span
              className="cursor-default text-on-surface-variant text-xs"
              data-tooltip={formatCreatedTooltip(note.createdAt, lang)}
            >
              {t('edited', { time: formatEdited(note.updatedAt, lang) })}
            </span>
          </div>

          {showFormatBar && !trashed && editor && <FormatBar editor={editor} />}

          <div
            className={`flex flex-none items-center gap-0.5 px-2 py-1.5 ${trashed ? '' : 'max-md:hidden'}`}
          >
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
                  svg={personAddSvg}
                  label={t('sharing:collaborator')}
                  size={38}
                  iconSize={19}
                  className="text-on-surface-variant"
                  onClick={() => setShowShare(true)}
                />
                <Popover.Root>
                  <Popover.Trigger
                    aria-label={t('reminders:addReminder')}
                    data-tooltip={t('reminders:addReminder')}
                    className={iconButtonClass}
                    style={{ width: 38, height: 38 }}
                  >
                    <Icon svg={addAlertSvg} size={19} />
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Positioner className="z-50" sideOffset={4}>
                      <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                        <EditorReminderPop note={note} />
                      </Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </Popover.Root>
                {!isList && (
                  <IconButton
                    svg={formatSvg}
                    label={t('formattingOptions')}
                    size={38}
                    iconSize={19}
                    className={`text-on-surface-variant ${showFormatBar ? 'bg-(--surface-hover)' : ''}`}
                    onClick={() => setShowFormatBar((v) => !v)}
                  />
                )}
                <Popover.Root>
                  <Popover.Trigger
                    aria-label={t('notes:backgroundOptions')}
                    data-tooltip={t('notes:backgroundOptions')}
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
                  svg={imageSvg}
                  label={t('notes:addImage')}
                  size={38}
                  iconSize={19}
                  className="text-on-surface-variant"
                  onClick={() => fileInputRef.current?.click()}
                />
                <IconButton
                  svg={archiveSvg}
                  label={note.archived ? t('notes:unarchiveNote') : t('shell:navArchive')}
                  size={38}
                  iconSize={19}
                  className="text-on-surface-variant"
                  onClick={toggleArchive}
                />
                <Menu.Root>
                  <Menu.Trigger
                    aria-label={t('notes:more')}
                    data-tooltip={t('notes:more')}
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
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => setLabelPicker({ open: true, seed: '' })}
                        >
                          {note.labelIds.length > 0
                            ? t('labels:changeLabels')
                            : t('labels:addLabel')}
                        </Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={() => openDrawing('new')}>
                          {t('addDrawing')}
                        </Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={() => setShowVersions(true)}>
                          {t('versionHistory')}
                        </Menu.Item>
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() =>
                            m.convert.mutate({ id: note.id, to: isList ? 'text' : 'list' })
                          }
                        >
                          {isList ? t('hideCheckboxes') : t('showCheckboxes')}
                        </Menu.Item>
                        {isList && note.items.some((i) => i.checked) && (
                          <>
                            <Menu.Item
                              className={menuItemClass}
                              onClick={() => checklistRef.current?.uncheckAll()}
                            >
                              {t('uncheckAllItems')}
                            </Menu.Item>
                            <Menu.Item
                              className={menuItemClass}
                              onClick={() => checklistRef.current?.deleteChecked()}
                            >
                              {t('deleteCheckedItems')}
                            </Menu.Item>
                          </>
                        )}
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

          {/* Mobile bottom bar: add / palette / format on the left, ⋮ right. */}
          {!trashed && (
            <div className="flex flex-none items-center gap-2 px-3 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
              <MobileAction
                round
                svg={addBoxSvg}
                label={t('addToNote')}
                onClick={() => setSheet('add')}
              />
              <MobileAction
                round
                svg={paletteSvg}
                label={t('notes:backgroundOptions')}
                onClick={() => setSheet('palette')}
              />
              {!isList && (
                <MobileAction
                  round
                  svg={formatSvg}
                  label={t('formattingOptions')}
                  active={showFormatBar}
                  onClick={() => setShowFormatBar((v) => !v)}
                />
              )}
              <div className="ml-auto">
                <MobileAction
                  round
                  svg={moreSvg}
                  label={t('notes:more')}
                  onClick={() => setSheet('more')}
                />
              </div>
            </div>
          )}

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
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) attachmentM.upload.mutate({ noteId: note.id, file });
              e.target.value = '';
            }}
          />

          {/* Mobile bottom sheets (triggers all live under md:hidden). */}
          <BottomSheet
            open={sheet === 'add'}
            onOpenChange={(o) => !o && setSheet(null)}
            label={t('addToNote')}
          >
            <SheetItem
              svg={photoCameraSvg}
              label={t('takePhoto')}
              onClick={() => {
                setSheet(null);
                cameraInputRef.current?.click();
              }}
            />
            <SheetItem
              svg={imageSvg}
              label={t('notes:addImage')}
              onClick={() => {
                setSheet(null);
                fileInputRef.current?.click();
              }}
            />
            <SheetItem
              svg={brushSvg}
              label={t('drawing:drawing')}
              onClick={() => {
                setSheet(null);
                openDrawing('new');
              }}
            />
            {!isList && (
              <SheetItem
                svg={checkboxSvg}
                label={t('checkboxes')}
                onClick={() => {
                  setSheet(null);
                  m.convert.mutate({ id: note.id, to: 'list' });
                }}
              />
            )}
          </BottomSheet>

          <BottomSheet
            open={sheet === 'palette'}
            onOpenChange={(o) => !o && setSheet(null)}
            label={t('notes:backgroundOptions')}
          >
            <div className="px-3 pb-1">
              <ColorPicker
                color={note.color}
                background={note.background}
                onColor={(color) => m.patchState.mutate({ id: note.id, patch: { color } })}
                onBackground={(background) =>
                  m.patchState.mutate({ id: note.id, patch: { background } })
                }
              />
            </div>
          </BottomSheet>

          <BottomSheet
            open={sheet === 'reminder'}
            onOpenChange={(o) => !o && setSheet(null)}
            label={t('reminders:addReminder')}
          >
            <NoteReminderPicker note={note} onDone={() => setSheet(null)} />
          </BottomSheet>

          <BottomSheet
            open={sheet === 'labels'}
            onOpenChange={(o) => !o && setSheet(null)}
            label={note.labelIds.length > 0 ? t('labels:changeLabels') : t('labels:addLabel')}
          >
            <NoteLabelPicker note={note} initialFilter="" />
          </BottomSheet>

          <BottomSheet
            open={sheet === 'more'}
            onOpenChange={(o) => !o && setSheet(null)}
            label={t('notes:more')}
          >
            <div className="border-(--outline-variant) border-b px-6 pt-1 pb-3 text-on-surface-variant text-sm">
              <div>{t('edited', { time: formatEdited(note.updatedAt, lang) })}</div>
              <BodyCounts words={words} chars={counted.length} lang={lang} />
            </div>
            <SheetItem
              svg={deleteSvg}
              label={t('notes:deleteNote')}
              onClick={() => {
                setSheet(null);
                autosave.flush();
                m.trashWithUndo(note);
                onClose();
              }}
            />
            <SheetItem
              svg={contentCopySvg}
              label={t('notes:makeACopy')}
              onClick={() => {
                setSheet(null);
                autosave.flush();
                m.copy.mutate(note.id);
              }}
            />
            {'share' in navigator && (
              <SheetItem
                svg={shareSvg}
                label={t('send')}
                onClick={() => {
                  setSheet(null);
                  shareNote();
                }}
              />
            )}
            <SheetItem
              svg={personAddSvg}
              label={t('sharing:collaborator')}
              onClick={() => {
                setSheet(null);
                setShowShare(true);
              }}
            />
            <SheetItem
              svg={labelSvg}
              label={note.labelIds.length > 0 ? t('labels:changeLabels') : t('labels:addLabel')}
              onClick={() => setSheet('labels')}
            />
            <SheetItem
              svg={historySvg}
              label={t('versionHistory')}
              onClick={() => {
                setSheet(null);
                setShowVersions(true);
              }}
            />
            {isList && (
              <SheetItem
                svg={checkboxSvg}
                label={t('hideCheckboxes')}
                onClick={() => {
                  setSheet(null);
                  m.convert.mutate({ id: note.id, to: 'text' });
                }}
              />
            )}
            {isList && note.items.some((i) => i.checked) && (
              <>
                <SheetItem
                  svg={checkboxBlankSvg}
                  label={t('uncheckAllItems')}
                  onClick={() => {
                    setSheet(null);
                    checklistRef.current?.uncheckAll();
                  }}
                />
                <SheetItem
                  svg={deleteSweepSvg}
                  label={t('deleteCheckedItems')}
                  onClick={() => {
                    setSheet(null);
                    checklistRef.current?.deleteChecked();
                  }}
                />
              </>
            )}
          </BottomSheet>

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
          {showShare && (
            <NoteShareDialog note={note} open={showShare} onOpenChange={setShowShare} />
          )}
          {labelPicker.open && (
            <Popover.Root
              open
              onOpenChange={(o) => !o && setLabelPicker({ open: false, seed: '' })}
            >
              <Popover.Trigger
                className="absolute bottom-12 left-4 h-px w-px opacity-0"
                aria-hidden
                tabIndex={-1}
              />
              <Popover.Portal>
                <Popover.Positioner className="z-50" sideOffset={2}>
                  <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                    <NoteLabelPicker note={note} initialFilter={labelPicker.seed} />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
