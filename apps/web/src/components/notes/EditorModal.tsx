import { Dialog } from '@base-ui/react/dialog';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import addAlertSvg from '@material-symbols/svg-700/outlined/add_alert.svg?raw';
import addBoxSvg from '@material-symbols/svg-700/outlined/add_box.svg?raw';
import archiveSvg from '@material-symbols/svg-700/outlined/archive.svg?raw';
import arrowBackSvg from '@material-symbols/svg-700/outlined/arrow_back.svg?raw';
import attachFileSvg from '@material-symbols/svg-700/outlined/attach_file.svg?raw';
import brushSvg from '@material-symbols/svg-700/outlined/brush.svg?raw';
import checkboxSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import checkboxBlankSvg from '@material-symbols/svg-700/outlined/check_box_outline_blank.svg?raw';
import contentCopySvg from '@material-symbols/svg-700/outlined/content_copy.svg?raw';
import deleteSvg from '@material-symbols/svg-700/outlined/delete.svg?raw';
import deleteSweepSvg from '@material-symbols/svg-700/outlined/delete_sweep.svg?raw';
import downloadSvg from '@material-symbols/svg-700/outlined/download.svg?raw';
import formatSvg from '@material-symbols/svg-700/outlined/format_color_text.svg?raw';
import historySvg from '@material-symbols/svg-700/outlined/history.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import pinSvg from '@material-symbols/svg-700/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-700/outlined/keep-fill.svg?raw';
import labelSvg from '@material-symbols/svg-700/outlined/label.svg?raw';
import lockSvg from '@material-symbols/svg-700/outlined/lock.svg?raw';
import lockOpenSvg from '@material-symbols/svg-700/outlined/lock_open.svg?raw';
import micSvg from '@material-symbols/svg-700/outlined/mic.svg?raw';
import moreSvg from '@material-symbols/svg-700/outlined/more_vert.svg?raw';
import noteStackSvg from '@material-symbols/svg-700/outlined/note_stack.svg?raw';
import paletteSvg from '@material-symbols/svg-700/outlined/palette.svg?raw';
import personAddSvg from '@material-symbols/svg-700/outlined/person_add.svg?raw';
import photoCameraSvg from '@material-symbols/svg-700/outlined/photo_camera.svg?raw';
import printSvg from '@material-symbols/svg-700/outlined/print.svg?raw';
import redoSvg from '@material-symbols/svg-700/outlined/redo.svg?raw';
import searchSvg from '@material-symbols/svg-700/outlined/search.svg?raw';
import shareSvg from '@material-symbols/svg-700/outlined/share.svg?raw';
import undoSvg from '@material-symbols/svg-700/outlined/undo.svg?raw';
import {
  FILE_ACCEPT,
  type FullNote,
  htmlToPlainText,
  LIMITS,
  parseNoteLinkHref,
} from '@openkeep/shared';
import { useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { audioRecordingSupported, useAudioRecorder } from '../../hooks/use-audio-recorder.js';
import { useAutosave } from '../../hooks/use-autosave.js';
import { useNoteFromTemplate } from '../../hooks/use-create-note.js';
import { useFieldHistory } from '../../hooks/use-field-history.js';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { usePrintNote } from '../../hooks/use-print-note.js';
import { useProtectionMutations, useRevealed } from '../../hooks/use-protection.js';
import { formatCreatedTooltip, formatEdited } from '../../lib/dates.js';
import { downloadNoteMarkdown } from '../../lib/download-markdown.js';
import { takeEditorOrigin } from '../../lib/editor-origin.js';
import type { FieldSnapshot, HistoryItem } from '../../lib/field-history.js';
import { applyFind, findInText, findMatchCount } from '../../lib/find-in-note.js';
import { noteMutationKeys } from '../../lib/note-mutation-defaults.js';
import { canEditContent, isViewer } from '../../lib/note-permissions.js';
import { removeNote } from '../../lib/note-selectors.js';
import { deleteNoteForever, notesQuery, trashNote } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';
import { NOTE_INPUT_RULES, noteExtensions, returnCaretOnCancel } from '../../lib/tiptap.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { useUiStore } from '../../stores/ui.js';
import { BottomSheet, SheetItem } from '../BottomSheet.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { NoteLabelChips } from '../labels/LabelChips.js';
import { NoteLabelPicker } from '../labels/LabelPicker.js';
import { AudioRecorderBar } from './AudioRecorderBar.js';
import type { ChecklistHandle } from './ChecklistEditor.js';
import { ChecklistEditor } from './ChecklistEditor.js';
import { ColorPicker } from './ColorPicker.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { displayGroups } from './checklist-logic.js';
import { FindBar } from './FindBar.js';
import { FormatBar } from './FormatBar.js';
import { LinkPreviewChips } from './LinkPreviewChips.js';
import { NoteBackgroundArt } from './NoteBackground.js';
import { NoteBacklinks } from './NoteBacklinks.js';
import { NoteFileChips } from './NoteFileChips.js';
import { NoteImages } from './NoteImages.js';
import { NotePicker, pickNoteLink } from './NotePicker.js';
import { NoteReminderChip } from './ReminderChip.js';
import { NoteReminderPicker } from './ReminderPicker.js';
import { NoteShareDialog } from './ShareDialog.js';
import { VersionHistoryDialog } from './VersionHistoryDialog.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

/** Stands in for "there is no committed value to compare against". */
const UNTRACKED = Symbol('untracked');

type MobileSheet = 'add' | 'palette' | 'more' | 'reminder' | 'labels' | null;

/**
 * Which container transform the modal opens with, or null when motion is off.
 * Desktop morphs the card into the floating dialog; mobile morphs it into the
 * whole screen, the way the Keep app expands a note.
 */
function morphKind(): 'desktop' | 'mobile' | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  return window.matchMedia('(min-width: 768px)').matches ? 'desktop' : 'mobile';
}

function htmlIsBlank(html: string): boolean {
  // A divider carries no text but is still something the user put there.
  if (/<hr\s*\/?>/i.test(html)) return false;
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
  const search = useSearch({ strict: false }) as {
    note?: string;
    new?: boolean;
    drawing?: string;
    record?: boolean;
  };
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
  return (
    <EditorDialog
      key={noteId}
      noteId={noteId}
      isNew={search.new === true}
      autoRecord={search.record === true}
      onClose={close}
    />
  );
}

function EditorDialog({
  noteId,
  isNew,
  autoRecord,
  onClose,
}: {
  noteId: string;
  isNew: boolean;
  autoRecord: boolean;
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

  // A protected note arrives with nothing in it, so there is no editor to
  // open: the URL bounces to the unlock prompt, which navigates back here
  // once the curtain is up. Closing the prompt leaves the board, not a shell.
  const revealed = useRevealed();
  const hidden = note?.locked === true && !revealed;
  const setUnlockPrompt = useUiStore((s) => s.setUnlockPrompt);
  useEffect(() => {
    if (!hidden) return;
    setUnlockPrompt(noteId);
    onClose();
  }, [hidden, noteId, setUnlockPrompt, onClose]);

  if (!note || hidden) return null;
  return (
    <EditorBody
      note={note}
      isNew={isNew}
      autoRecord={autoRecord}
      onClose={onClose}
      t={t}
      lang={i18n.language}
      m={m}
    />
  );
}

function EditorBody({
  note,
  isNew,
  autoRecord,
  onClose,
  t,
  lang,
  m,
}: {
  note: FullNote;
  isNew: boolean;
  autoRecord: boolean;
  onClose: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
  lang: string;
  m: ReturnType<typeof useNoteMutations>;
}) {
  const trashed = note.trashedAt !== null;
  // Two different read-onlys: the trash freezes the whole note for everyone,
  // view-only freezes just the shared content — this person keeps their own
  // pin, color, labels and reminder, so the chrome around it stays live.
  const viewOnly = isViewer(note);
  const canEdit = canEditContent(note);
  const isList = note.type === 'list';
  const navigate = useNavigate();
  const noteFromTemplate = useNoteFromTemplate();
  // Block grid/base single-char shortcuts while the editor is open; Ctrl+F is
  // the one key the editor claims for itself (assigned below, through a ref, so
  // the binding registered here stays stable for the editor's whole life).
  const openFindRef = useRef<() => void>(() => {});
  const checklistRef = useRef<ChecklistHandle | null>(null);
  // Keep's list-item keys. They reach the engine only when the focus is not
  // typing — inside the title, the body or an item's textarea `n` is still the
  // letter n — so the checklist's own "selected item" is what they steer. On a
  // note that is not a list there is no handle to ask, and they do nothing.
  const editorBindings = useMemo(
    () => ({
      'mod+f': () => openFindRef.current(),
      n: () => checklistRef.current?.selectItem(1),
      p: () => checklistRef.current?.selectItem(-1),
      'shift+n': () => checklistRef.current?.moveItem(1),
      'shift+p': () => checklistRef.current?.moveItem(-1),
    }),
    [],
  );
  useKeyScope('editor', editorBindings);

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
  /**
   * Following a note link, in either direction: the body's `[[` links and the
   * backlink chips. The editor is route-driven, so "open the other note" is
   * the same URL change a deep link makes — the modal is keyed by the id and
   * simply becomes that note, with the back button undoing the hop.
   */
  const openNote = (id: string) => {
    autosave.flush();
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, note: id, new: undefined }),
      resetScroll: false,
    });
  };

  /**
   * A click on a link to another note stays inside the app. Capture phase, so
   * it lands before both the browser's own navigation and TipTap's
   * open-in-a-new-tab handler — a note link is not an outbound link.
   */
  const interceptNoteLink = (e: MouseEvent) => {
    const href = (e.target as HTMLElement).closest?.('a[href]')?.getAttribute('href');
    const id = href ? parseNoteLinkHref(href) : null;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    openNote(id);
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
  const [notePicker, setNotePicker] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  /** Which of the two histories the toolbar buttons should reach for first. */
  const lastSurfaceRef = useRef<'body' | 'fields'>('fields');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const attachmentM = useAttachmentMutations();
  // Keep's voice note. Offered only where the browser can actually run it
  // (MediaRecorder + a secure context) and never on a note this person may
  // only read — the take lands as an attachment, which is shared content.
  const canRecord = canEdit && audioRecordingSupported();
  // A take counts as content the moment it exists, not when its upload acks:
  // the untouched-note discard below reads the note's own attachments, which
  // stay empty until then — and a note created by the FAB to record into is
  // exactly the note that discard is aimed at.
  const recordedRef = useRef(false);
  const recorder = useAudioRecorder(
    (file) => {
      recordedRef.current = true;
      attachmentM.uploadAudio.mutate({ noteId: note.id, file });
    },
    (kind) =>
      show({
        message: t(
          kind === 'denied'
            ? 'micDenied'
            : kind === 'tooShort'
              ? 'recordingTooShort'
              : 'recordingFailed',
        ),
      }),
  );
  const recordingRef = useRef(false);
  recordingRef.current = recorder.status !== 'idle';

  // Arrived from the FAB's "Recording": arm the mic once, then drop the flag
  // from the URL so a reload (or the back button) does not record again.
  const autoRecordedRef = useRef(false);
  useEffect(() => {
    if (!autoRecord || autoRecordedRef.current) return;
    autoRecordedRef.current = true;
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, record: undefined }),
      replace: true,
      resetScroll: false,
    });
    if (canRecord) void recorder.start();
  }, [autoRecord, canRecord, recorder.start, navigate]);

  const printNote = usePrintNote();
  const protection = useProtectionMutations();
  const setOpenEditorNoteId = useUiStore((s) => s.setOpenEditorNoteId);

  /**
   * Protecting the note one is reading closes it — otherwise the only sign
   * anything happened is a snackbar, and the point of the lock is the card it
   * leaves on the board.
   */
  const toggleProtection = () => {
    autosave.flush();
    if (note.locked) protection.unprotect.mutate(note.id);
    else {
      protection.protect.mutate(note.id);
      onClose();
    }
  };

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
    const kind = morphKind();
    if (!from || !kind) return;
    const to = node.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return;
    // Growing a card to full screen stretches its text on the way, so on
    // mobile the content fades in over the tail of the morph instead.
    if (kind === 'mobile') node.classList.add('editor-morph-in');
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
      kind === 'mobile'
        ? { duration: 220, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)' }
        : { duration: 195, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  };

  /** Morph back onto the card, then run the actual close. */
  const animateClose = (after: () => void) => {
    const popup = popupRef.current;
    const from = document.querySelector(`[data-note-id="${note.id}"]`)?.getBoundingClientRect();
    const kind = morphKind();
    if (!popup || !from || !kind) {
      after();
      return;
    }
    const to = popup.getBoundingClientRect();
    popup.style.pointerEvents = 'none';
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 160,
      fill: 'forwards',
    });
    // Mirror of the open morph: the content fades first, so the full-screen
    // surface shrinks back onto the card without squashing its text.
    if (kind === 'mobile') popup.classList.add('editor-morph-out');
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
      kind === 'mobile'
        ? { duration: 180, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)', fill: 'forwards' }
        : { duration: 160, easing: 'cubic-bezier(0.3, 0, 1, 1)', fill: 'forwards' },
    );
    anim.finished.catch(() => undefined).finally(after);
  };

  const noteIdRef = useRef(note.id);
  // Read through a ref: the guard has to compare against the note as it reads
  // now, not as it read when the autosave was created.
  const noteRef = useRef(note);
  noteRef.current = note;
  const autosave = useAutosave(
    (patch) => {
      m.patchContent.mutate({ id: noteIdRef.current, patch });
    },
    500,
    note.id,
    (field) => {
      if (field === 'title') return noteRef.current.title;
      if (field === 'bodyHtml') return noteRef.current.bodyHtml;
      // A field nobody tracks here must never compare equal to anything.
      return UNTRACKED;
    },
  );

  const bodyEmptyRef = useRef(htmlIsBlank(note.bodyHtml));
  const editor = useEditor({
    // Keep's `#` quick-labeling lives in the shared extension, which also
    // knows when `#` is markdown heading syntax instead.
    extensions: noteExtensions(
      t('notePlaceholder'),
      (seed) => setLabelPicker({ open: true, seed }),
      () => setNotePicker(true),
    ),
    content: note.bodyHtml,
    editable: canEdit,
    // The markdown extension owns pasted plain text end to end; StarterKit's
    // own paste rules are looser (they italicize `2 * 3 * 4`) and would fire
    // on the text this one deliberately leaves alone.
    enableInputRules: NOTE_INPUT_RULES,
    enablePasteRules: false,
    onUpdate: ({ editor: ed }) => {
      bodyEmptyRef.current = ed.isEmpty;
      lastSurfaceRef.current = 'body';
      autosave.markDirty('bodyHtml', ed.getHTML());
    },
    // Leaving a field commits it: the debounce is there to batch keystrokes,
    // not to keep an edit the user has visibly walked away from in limbo.
    onBlur: () => autosave.flush(),
  });

  // The permission can change under an open editor (the owner flips it from
  // another device), and `editable` was read when the instance was created.
  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // ------------------------------------------------------ session undo/redo
  /**
   * TipTap's history covers the body; the title and the list items are native
   * textareas with nothing behind Ctrl+Z. They get a ring buffer of snapshots
   * for the life of the editing session (see `lib/field-history.ts`) —
   * recorded as each edit lands, applied by writing the title back into its
   * uncontrolled textarea and handing the rows to the checklist.
   */
  const readFields = (): FieldSnapshot => ({
    title: titleRef.current?.value ?? note.title,
    items: isList
      ? (checklistRef.current?.snapshot() ??
        note.items.map(
          (i): HistoryItem => ({
            key: i.id,
            text: i.text,
            checked: i.checked,
            indent: i.indent,
            position: i.position,
          }),
        ))
      : null,
  });
  const readFieldsRef = useRef(readFields);
  readFieldsRef.current = readFields;
  const history = useFieldHistory(() => readFieldsRef.current(), `${note.id}:${note.type}`);

  const applyFields = (snapshot: FieldSnapshot) => {
    const el = titleRef.current;
    if (el && el.value !== snapshot.title) {
      el.value = snapshot.title;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      // Undoing to the value the server already holds is not a save; the
      // autosave drops it, and the dirty flag it would have set with it.
      autosave.markDirty('title', snapshot.title);
    }
    if (snapshot.items) checklistRef.current?.restore(snapshot.items);
  };

  /**
   * Ctrl+Z / Ctrl+Y across both histories. A keystroke belongs to the surface
   * it was typed in — inside the body ProseMirror's own keymap claims it, so
   * this only runs for the title and the items — while the toolbar buttons
   * follow the surface edited last and fall back to the other one when it has
   * nothing left to give.
   */
  const runHistory = (dir: 'undo' | 'redo', prefer: 'body' | 'fields') => {
    if (!canEdit) return;
    const body = () => {
      if (isList || !editor) return false;
      if (!(dir === 'undo' ? editor.can().undo() : editor.can().redo())) return false;
      const chain = editor.chain().focus();
      (dir === 'undo' ? chain.undo() : chain.redo()).run();
      lastSurfaceRef.current = 'body';
      return true;
    };
    const fields = () => {
      const snapshot = history.walk(dir, readFields());
      if (!snapshot) return false;
      applyFields(snapshot);
      lastSurfaceRef.current = 'fields';
      return true;
    };
    for (const run of prefer === 'body' ? [body, fields] : [fields, body]) {
      if (run()) return;
    }
  };

  const bodyHistory = (dir: 'undo' | 'redo') =>
    !isList && (dir === 'undo' ? (editor?.can().undo() ?? false) : (editor?.can().redo() ?? false));
  const canUndo = history.canUndo || bodyHistory('undo');
  const canRedo = history.canRedo || bodyHistory('redo');

  // Counted off the plain text the server derives, so the "/ 19,999" the user
  // sees is the same number the body limit is enforced against.
  const bodyText = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? htmlToPlainText(ed.getHTML()) : ''),
  });
  const counted = isList ? note.items.map((i) => i.text).join('\n') : (bodyText ?? '');
  const trimmed = counted.trim();
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length;

  // ------------------------------------------------------------------- find
  /**
   * Ctrl+F inside the open note — the search Keep spent 13 years without.
   *
   * Matches are counted over the whole note in reading order (title, then body
   * or items) and `step` walks them, unbounded: the index is taken modulo the
   * total, so it wraps at both ends and survives the total changing under it.
   * Only the body can highlight the matched words themselves — title and items
   * are native textareas, where the highlight can only be the field.
   */
  const [find, setFind] = useState({ open: false, query: '', step: 0 });
  const findQuery = find.open ? find.query : '';

  // The title is an uncontrolled textarea, so the DOM node holds the live
  // value. It is read during render on purpose: the bar re-renders on every
  // keystroke of the query, which is the only moment this can matter.
  const titleHits = findInText(titleRef.current?.value ?? note.title, findQuery).length;

  // Item hits in the order the rows are shown, so Enter walks the note the way
  // it reads (the completed section sits at the bottom, per the setting).
  const itemHits = useMemo(() => {
    if (!isList || findQuery === '') return [];
    const rows = note.items.map((i) => ({ ...i, key: i.id }));
    const { unchecked, checked } = displayGroups(rows, settings?.moveCheckedToBottom ?? true);
    return [...unchecked, ...checked]
      .map((r) => ({ id: r.id ?? '', count: findInText(r.text, findQuery).length }))
      .filter((r) => r.count > 0);
  }, [isList, findQuery, note.items, settings?.moveCheckedToBottom]);

  const bodyHits =
    useEditorState({ editor, selector: ({ editor: ed }) => (ed ? findMatchCount(ed) : 0) }) ?? 0;
  const findTotal = titleHits + (isList ? itemHits.reduce((n, r) => n + r.count, 0) : bodyHits);
  const findIndex = findTotal === 0 ? -1 : ((find.step % findTotal) + findTotal) % findTotal;
  const titleIsCurrent = findIndex >= 0 && findIndex < titleHits;
  const bodyIndex = !isList && findIndex >= titleHits ? findIndex - titleHits : -1;
  const currentItemId = (() => {
    if (!isList || findIndex < titleHits) return null;
    let rest = findIndex - titleHits;
    for (const hit of itemHits) {
      if (rest < hit.count) return hit.id;
      rest -= hit.count;
    }
    return null;
  })();
  const checklistFind = useMemo(
    () => ({ hits: new Set(itemHits.map((h) => h.id)), current: currentItemId }),
    [itemHits, currentItemId],
  );

  const openFind = () => {
    setFind((f) => ({ open: true, query: f.query, step: 0 }));
    // Already open (a second Ctrl+F): the bar is mounted, so its own focus
    // effect will not run again.
    const input = popupRef.current?.querySelector<HTMLInputElement>('[data-find-input]');
    input?.focus();
    input?.select();
  };
  openFindRef.current = openFind;

  useEffect(() => {
    if (editor) applyFind(editor, isList ? '' : findQuery, bodyIndex);
  }, [editor, isList, findQuery, bodyIndex]);

  // Bring the current match into view — a decorated word in the body, the
  // whole field for the title and the checklist rows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the extra deps are the trigger — the element to scroll to is found in the DOM, which the query and the index have just moved
  useEffect(() => {
    if (!find.open) return;
    popupRef.current
      ?.querySelector('.find-match-current, [data-find-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [find.open, findIndex, findQuery]);

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
    if (isNew && !isList && canEdit) editor?.commands.focus('end');
  }, [isNew, isList, canEdit, editor]);

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
    // Closing the note mid-recording keeps the take (the recorder stops on
    // unmount), so this note is about to receive an attachment.
    if (recordedRef.current || recordingRef.current) return false;
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

  /**
   * Onto the template shelf, or off it — and either way out of this editor,
   * for the same reason archiving closes it: the note has just left the view
   * that was underneath, so staying open would leave nothing to go back to.
   */
  const toggleTemplate = () => {
    autosave.flush();
    m.toggleTemplateWithUndo(note);
    onClose();
  };

  /** The note as it reads right now, including edits the autosave still owes. */
  const currentNote = (): FullNote => ({
    ...note,
    title: titleRef.current?.value ?? note.title,
    bodyHtml: !isList && editor ? editor.getHTML() : note.bodyHtml,
  });

  const shareNote = () => {
    const live = currentNote();
    const body = isList
      ? note.items.map((i) => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n')
      : htmlToShareText(live.bodyHtml);
    const text = live.title ? `${live.title}\n\n${body}` : body;
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
            } else if (e.ctrlKey && e.shiftKey && e.key === '8' && canEdit) {
              e.preventDefault();
              m.convert.mutate({ id: note.id, to: isList ? 'text' : 'list' });
            } else if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) {
              const dir = e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo';
              const inBody = editor?.view.dom.contains(e.target as Node) === true;
              // Typed inside the body: ProseMirror's keymap already has the
              // keystroke — until its own history runs out, at which point the
              // fields keep the shortcut alive instead of it going dead.
              if (inBody && (dir === 'undo' ? editor?.can().undo() : editor?.can().redo())) return;
              // The title's native undo would fight this one, and the item
              // textareas are controlled, so theirs does nothing at all.
              e.preventDefault();
              e.stopPropagation();
              runHistory(dir, inBody ? 'body' : 'fields');
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
            {/* The desktop badge lives in the bottom bar, which is hidden here. */}
            {viewOnly && !trashed && (
              <span className="pl-1 text-on-surface-variant text-sm">{t('sharing:viewOnly')}</span>
            )}
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

          {find.open && (
            <FindBar
              query={find.query}
              onQuery={(query) => setFind({ open: true, query, step: 0 })}
              total={findTotal}
              index={findIndex}
              onNext={() => setFind((f) => ({ ...f, step: f.step + 1 }))}
              onPrev={() => setFind((f) => ({ ...f, step: f.step - 1 }))}
              onClose={() => setFind((f) => ({ ...f, open: false }))}
            />
          )}

          {recorder.status !== 'idle' && (
            <AudioRecorderBar
              status={recorder.status}
              seconds={recorder.seconds}
              onStop={recorder.stop}
              onCancel={recorder.cancel}
            />
          )}

          {/* Images, title and body scroll as one, so the note grows to show
              the picture and reads on below it (Keep) instead of peering at it
              through a fixed window. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <NoteImages note={note} editable={canEdit} />

            <div className="flex flex-none items-start">
              <textarea
                ref={titleRef}
                defaultValue={note.title}
                placeholder={t('titlePlaceholder')}
                aria-label={t('titlePlaceholder')}
                rows={1}
                maxLength={999}
                readOnly={!canEdit}
                onChange={(e) => {
                  autosave.markDirty('title', e.target.value);
                  lastSurfaceRef.current = 'fields';
                  history.record({ title: e.target.value, items: readFields().items }, 'title');
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onBlur={() => autosave.flush()}
                data-find-current={titleIsCurrent ? 'true' : undefined}
                className={`w-full resize-none bg-transparent px-4 pt-4 pb-2 font-semibold text-[1.625rem] text-on-surface leading-9 outline-none placeholder:text-on-surface-variant ${
                  titleHits > 0
                    ? titleIsCurrent
                      ? 'find-field find-field-current'
                      : 'find-field'
                    : ''
                }`}
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
              className="min-h-[46px] flex-1 px-4 pb-3"
              onClickCapture={interceptNoteLink}
              onClick={(e) => {
                if (!isList && canEdit && e.target === e.currentTarget)
                  editor?.commands.focus('end');
              }}
            >
              {isList ? (
                <ChecklistEditor
                  note={note}
                  readOnly={!canEdit}
                  moveCheckedToBottom={settings?.moveCheckedToBottom ?? true}
                  addItemsToBottom={settings?.addItemsToBottom ?? true}
                  handleRef={checklistRef}
                  find={find.open ? checklistFind : undefined}
                  onStep={(items, groupKey) => {
                    lastSurfaceRef.current = 'fields';
                    history.record(
                      { title: titleRef.current?.value ?? note.title, items },
                      groupKey,
                    );
                  }}
                />
              ) : (
                <EditorContent editor={editor} className="note-editor" />
              )}
            </div>
          </div>

          <NoteFileChips note={note} editable={canEdit && !trashed} />
          <LinkPreviewChips note={note} />
          <NoteBacklinks note={note} onOpen={openNote} />
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

          {showFormatBar && canEdit && editor && <FormatBar editor={editor} />}

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
                {viewOnly && (
                  <span className="pr-1 pl-2 text-on-surface-variant text-sm">
                    {t('sharing:viewOnly')}
                  </span>
                )}
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
                {!isList && canEdit && (
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
                {canEdit && (
                  <IconButton
                    svg={imageSvg}
                    label={t('notes:addImage')}
                    size={38}
                    iconSize={19}
                    className="text-on-surface-variant"
                    onClick={() => fileInputRef.current?.click()}
                  />
                )}
                {canEdit && (
                  <IconButton
                    svg={attachFileSvg}
                    label={t('attachFile')}
                    size={38}
                    iconSize={19}
                    className="text-on-surface-variant"
                    onClick={() => docInputRef.current?.click()}
                  />
                )}
                {canRecord && (
                  <IconButton
                    svg={micSvg}
                    label={t('recordAudio')}
                    size={38}
                    iconSize={19}
                    className="text-on-surface-variant"
                    // The bar owns the recording once it is running: two stops
                    // in two places is one more than there is to stop.
                    disabled={recorder.status !== 'idle'}
                    onClick={() => void recorder.start()}
                  />
                )}
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
                        {canEdit && (
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
                        )}
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => {
                            autosave.flush();
                            if (note.isTemplate) noteFromTemplate(note.id);
                            else m.copy.mutate(note.id);
                          }}
                        >
                          {note.isTemplate ? t('notes:useTemplate') : t('notes:makeACopy')}
                        </Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={toggleTemplate}>
                          {note.isTemplate
                            ? t('notes:removeFromTemplates')
                            : t('notes:saveAsTemplate')}
                        </Menu.Item>
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => setLabelPicker({ open: true, seed: '' })}
                        >
                          {note.labelIds.length > 0
                            ? t('labels:changeLabels')
                            : t('labels:addLabel')}
                        </Menu.Item>
                        {canEdit && (
                          <Menu.Item className={menuItemClass} onClick={() => openDrawing('new')}>
                            {t('addDrawing')}
                          </Menu.Item>
                        )}
                        <Menu.Item className={menuItemClass} onClick={openFind}>
                          {t('findInNote')}
                        </Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={toggleProtection}>
                          {note.locked ? t('notes:removeProtection') : t('notes:protectNote')}
                        </Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={() => setShowVersions(true)}>
                          {t('versionHistory')}
                        </Menu.Item>
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => {
                            autosave.flush();
                            downloadNoteMarkdown(currentNote());
                          }}
                        >
                          {t('downloadMarkdown')}
                        </Menu.Item>
                        <Menu.Item
                          className={menuItemClass}
                          onClick={() => {
                            autosave.flush();
                            printNote(currentNote());
                          }}
                        >
                          {t('print')}
                        </Menu.Item>
                        {canEdit && (
                          <Menu.Item
                            className={menuItemClass}
                            onClick={() =>
                              m.convert.mutate({ id: note.id, to: isList ? 'text' : 'list' })
                            }
                          >
                            {isList ? t('hideCheckboxes') : t('showCheckboxes')}
                          </Menu.Item>
                        )}
                        {canEdit && isList && note.items.some((i) => i.checked) && (
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
                {canEdit && (
                  <>
                    <IconButton
                      svg={undoSvg}
                      label={t('undo')}
                      size={38}
                      iconSize={19}
                      className="text-on-surface-variant"
                      disabled={!canUndo}
                      onClick={() => runHistory('undo', lastSurfaceRef.current)}
                    />
                    <IconButton
                      svg={redoSvg}
                      label={t('redo')}
                      size={38}
                      iconSize={19}
                      className="text-on-surface-variant"
                      disabled={!canRedo}
                      onClick={() => runHistory('redo', lastSurfaceRef.current)}
                    />
                  </>
                )}
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
              {canEdit && (
                <MobileAction
                  round
                  svg={addBoxSvg}
                  label={t('addToNote')}
                  onClick={() => setSheet('add')}
                />
              )}
              <MobileAction
                round
                svg={paletteSvg}
                label={t('notes:backgroundOptions')}
                onClick={() => setSheet('palette')}
              />
              {!isList && canEdit && (
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
            ref={docInputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) attachmentM.uploadFile.mutate({ noteId: note.id, file });
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
              svg={attachFileSvg}
              label={t('attachFile')}
              onClick={() => {
                setSheet(null);
                docInputRef.current?.click();
              }}
            />
            {canRecord && (
              <SheetItem
                svg={micSvg}
                label={t('recordAudio')}
                onClick={() => {
                  setSheet(null);
                  void recorder.start();
                }}
              />
            )}
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
              {viewOnly && <div>{t('sharing:viewOnly')}</div>}
              <div>{t('edited', { time: formatEdited(note.updatedAt, lang) })}</div>
              <BodyCounts words={words} chars={counted.length} lang={lang} />
            </div>
            {canEdit && (
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
            )}
            <SheetItem
              svg={contentCopySvg}
              label={note.isTemplate ? t('notes:useTemplate') : t('notes:makeACopy')}
              onClick={() => {
                setSheet(null);
                autosave.flush();
                if (note.isTemplate) noteFromTemplate(note.id);
                else m.copy.mutate(note.id);
              }}
            />
            <SheetItem
              svg={noteStackSvg}
              label={note.isTemplate ? t('notes:removeFromTemplates') : t('notes:saveAsTemplate')}
              onClick={() => {
                setSheet(null);
                toggleTemplate();
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
              svg={searchSvg}
              label={t('findInNote')}
              onClick={() => {
                setSheet(null);
                openFind();
              }}
            />
            <SheetItem
              svg={note.locked ? lockOpenSvg : lockSvg}
              label={note.locked ? t('notes:removeProtection') : t('notes:protectNote')}
              onClick={() => {
                setSheet(null);
                toggleProtection();
              }}
            />
            <SheetItem
              svg={historySvg}
              label={t('versionHistory')}
              onClick={() => {
                setSheet(null);
                setShowVersions(true);
              }}
            />
            <SheetItem
              svg={downloadSvg}
              label={t('downloadMarkdown')}
              onClick={() => {
                setSheet(null);
                autosave.flush();
                downloadNoteMarkdown(currentNote());
              }}
            />
            <SheetItem
              svg={printSvg}
              label={t('print')}
              onClick={() => {
                setSheet(null);
                autosave.flush();
                printNote(currentNote());
              }}
            />
            {isList && canEdit && (
              <SheetItem
                svg={checkboxSvg}
                label={t('hideCheckboxes')}
                onClick={() => {
                  setSheet(null);
                  m.convert.mutate({ id: note.id, to: 'text' });
                }}
              />
            )}
            {isList && canEdit && note.items.some((i) => i.checked) && (
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
              canRestore={canEdit}
            />
          )}
          {showShare && (
            <NoteShareDialog note={note} open={showShare} onOpenChange={setShowShare} />
          )}
          {notePicker && (
            <Popover.Root
              open
              onOpenChange={(o, details) => {
                if (o) return;
                setNotePicker(false);
                returnCaretOnCancel(editor, details.reason);
              }}
            >
              <Popover.Trigger
                className="absolute bottom-12 left-4 h-px w-px opacity-0"
                aria-hidden
                tabIndex={-1}
              />
              <Popover.Portal>
                <Popover.Positioner className="z-50" sideOffset={2}>
                  <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
                    <NotePicker
                      excludeId={note.id}
                      onPick={(target) => {
                        setNotePicker(false);
                        pickNoteLink(editor, target, t('untitled'));
                      }}
                    />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          )}
          {labelPicker.open && (
            <Popover.Root
              open
              onOpenChange={(o, details) => {
                if (o) return;
                setLabelPicker({ open: false, seed: '' });
                returnCaretOnCancel(editor, details.reason);
              }}
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
