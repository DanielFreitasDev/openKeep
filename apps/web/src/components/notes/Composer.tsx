import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { DragLocationHistory } from '@atlaskit/pragmatic-drag-and-drop/types';
import { Menu } from '@base-ui/react/menu';
import { Popover } from '@base-ui/react/popover';
import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import addAlertSvg from '@material-symbols/svg-700/outlined/add_alert.svg?raw';
import archiveSvg from '@material-symbols/svg-700/outlined/archive.svg?raw';
import brushSvg from '@material-symbols/svg-700/outlined/brush.svg?raw';
import checkboxSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import dragSvg from '@material-symbols/svg-700/outlined/drag_indicator.svg?raw';
import formatSvg from '@material-symbols/svg-700/outlined/format_color_text.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import pinSvg from '@material-symbols/svg-700/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-700/outlined/keep-fill.svg?raw';
import moreSvg from '@material-symbols/svg-700/outlined/more_vert.svg?raw';
import noteStackSvg from '@material-symbols/svg-700/outlined/note_stack.svg?raw';
import paletteSvg from '@material-symbols/svg-700/outlined/palette.svg?raw';
import personAddSvg from '@material-symbols/svg-700/outlined/person_add.svg?raw';
import redoSvg from '@material-symbols/svg-700/outlined/redo.svg?raw';
import undoSvg from '@material-symbols/svg-700/outlined/undo.svg?raw';
import type { Collaborator, NoteBackground, NoteColor, SetReminder } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { useCollaboratorMutations } from '../../hooks/use-collaborator-mutations.js';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { useReminderMutations } from '../../hooks/use-reminder-mutations.js';
import { useReorderFlip } from '../../hooks/use-reorder-flip.js';
import type { DraftInvite } from '../../lib/drafts.js';
import { clearComposerDraft, saveComposerDraft } from '../../lib/drafts.js';
import { liftedRowPreview } from '../../lib/drag-preview.js';
import { selectHasTemplates } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { sessionQuery, settingsQuery } from '../../lib/queries.js';
import { dropSlot, moveToSlot } from '../../lib/reorder.js';
import { NOTE_INPUT_RULES, noteExtensions, returnCaretOnCancel } from '../../lib/tiptap.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { LabelChips } from '../labels/LabelChips.js';
import { LabelPicker } from '../labels/LabelPicker.js';
import { ColorPicker } from './ColorPicker.js';
import { FormatBar } from './FormatBar.js';
import { NotePicker, pickNoteLink } from './NotePicker.js';
import { ReminderChip } from './ReminderChip.js';
import { ReminderPicker } from './ReminderPicker.js';
import { ShareDialog } from './ShareDialog.js';
import { TemplatePickerDialog } from './TemplatePickerDialog.js';

const menuItemClass =
  'flex cursor-default select-none items-center px-4 py-2 text-sm text-on-surface outline-none data-[highlighted]:bg-(--surface-hover)';

const EMPTY_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/** An image chosen before the note exists; uploaded once it does. */
interface PendingImage {
  key: string;
  file: File;
  url: string;
}

/**
 * The Keep composer: collapsed "Take a note…" row that expands in place;
 * click-away saves; empty notes are discarded with a snackbar. Expanded, it
 * carries the same toolbar as the editor — everything that needs a note id
 * (reminder, labels, images, collaborators) is held as a draft and applied
 * right after the note is created.
 */
export function Composer() {
  const { t } = useTranslation('notes');
  const m = useNoteMutations();
  const reminderM = useReminderMutations();
  const labelM = useLabelMutations();
  const attachmentM = useAttachmentMutations();
  const collaboratorM = useCollaboratorMutations();
  const show = useSnackbarStore((s) => s.show);
  const { data: session } = useQuery(sessionQuery);
  const { data: settings } = useQuery(settingsQuery);
  const navigate = useNavigate();

  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'text' | 'list'>('text');
  const [title, setTitle] = useState('');
  const [listRows, setListRows] = useState<{ key: string; text: string }[]>([]);
  const [pinned, setPinned] = useState(false);
  const [color, setColor] = useState<NoteColor>('default');
  const [background, setBackground] = useState<NoteBackground>('none');
  const [reminder, setReminder] = useState<SetReminder | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [images, setImages] = useState<PendingImage[]>([]);
  const [invites, setInvites] = useState<DraftInvite[]>([]);
  const [showFormatBar, setShowFormatBar] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [labelPicker, setLabelPicker] = useState<{ open: boolean; seed: string }>({
    open: false,
    seed: '',
  });
  const [notePicker, setNotePicker] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const { data: hasTemplates } = useQuery({ ...notesQuery, select: selectHasTemplates });

  // While composing, block grid/base shortcuts entirely (same as the editor
  // modal) — an open composer is an editing surface, not the board.
  useKeyScope('editor', EMPTY_BINDINGS, expanded);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const collapsedRef = useRef<HTMLInputElement | null>(null);
  const newNoteImageRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // ------------------------------------------------------------- list rows
  /** The row that should hold the caret after the next render (a new one). */
  const focusRowRef = useRef<string | null>(null);
  const listInputRefs = useRef(new Map<string, HTMLInputElement>());
  const listRowRefs = useRef(new Map<string, HTMLElement>());
  /** The row being dragged right now — it leaves a gap while it travels. */
  const [dragRowKey, setDragRowKey] = useState<string | null>(null);
  /** The slot that drag would land in: the list renders in that order live. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dropIndexRef = useRef(dropIndex);
  dropIndexRef.current = dropIndex;
  const listRowsRef = useRef(listRows);
  listRowsRef.current = listRows;

  useLayoutEffect(() => {
    const key = focusRowRef.current;
    if (key === null) return;
    const el = listInputRefs.current.get(key);
    if (!el) return;
    focusRowRef.current = null;
    el.focus();
  });

  /** Insert an empty row after `afterKey` (null = at the top) and focus it. */
  const addListRow = useCallback((afterKey: string | null) => {
    const key = crypto.randomUUID();
    focusRowRef.current = key;
    setListRows((rows) => {
      const idx = afterKey === null ? -1 : rows.findIndex((r) => r.key === afterKey);
      const next = [...rows];
      next.splice(idx + 1, 0, { key, text: '' });
      return next;
    });
  }, []);

  const removeListRow = useCallback((key: string) => {
    setListRows((rows) => rows.filter((r) => r.key !== key));
  }, []);

  /** The slot the pointer is over, or null when it names no new one. */
  const slotUnderPointer = useCallback((key: string, location: DragLocationHistory) => {
    const target = location.current.dropTargets[0];
    const overKey = target?.data.rowKey;
    if (!target || typeof overKey !== 'string') return null;
    const rect = (target.element as HTMLElement).getBoundingClientRect();
    const before = location.current.input.clientY < rect.top + rect.height / 2;
    return dropSlot(listRowsRef.current, key, overKey, before);
  }, []);

  // Reorder by dragging a row's handle. Rows here are plain array order (the
  // note does not exist yet, so there are no fractional positions to patch) —
  // the list re-flows live while the row travels, and the drop keeps the order
  // the preview was already showing.
  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => source.data.composerRow === true,
      onDrag: ({ source, location }) => {
        const key = source.data.rowKey;
        if (typeof key !== 'string') return;
        const slot = slotUnderPointer(key, location);
        if (slot !== null) setDropIndex((prev) => (prev === slot ? prev : slot));
      },
      onDrop: ({ source, location }) => {
        const key = source.data.rowKey;
        setDragRowKey(null);
        setDropIndex(null);
        if (typeof key !== 'string') return;
        // Released over no row at all: the gap the preview holds open is the
        // answer.
        const slot = slotUnderPointer(key, location) ?? dropIndexRef.current;
        if (slot === null) return;
        setListRows((rows) => moveToSlot(rows, key, slot));
      },
    });
  }, [slotUnderPointer]);

  // The order on screen: the committed one, except mid-drag, where the dragged
  // row already sits in the slot it is heading for.
  const displayedRows = useMemo(
    () =>
      dragRowKey !== null && dropIndex !== null
        ? moveToSlot(listRows, dragRowKey, dropIndex)
        : listRows,
    [listRows, dragRowKey, dropIndex],
  );
  useReorderFlip(listRowRefs, displayedRows, dragRowKey !== null);

  // Draft mirror: the note id is fixed on the first mirrored write so a
  // create that never lands can be replayed (or deduped via 409) at next boot.
  const draftIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const [draftTick, setDraftTick] = useState(0);

  const editor = useEditor({
    // Keep's `#` quick-labeling lives in the shared extension, which also
    // knows when `#` is markdown heading syntax instead.
    // `[[` links out of a note that does not exist yet, which is fine: the
    // link points at its target, and nothing points back until this one lands.
    extensions: noteExtensions(
      t('takeANote'),
      (seed) => setLabelPicker({ open: true, seed }),
      () => setNotePicker(true),
    ),
    // The markdown extension owns pasted plain text end to end; StarterKit's
    // own paste rules are looser (they italicize `2 * 3 * 4`) and would fire
    // on the text this one deliberately leaves alone.
    enableInputRules: NOTE_INPUT_RULES,
    enablePasteRules: false,
    editorProps: {
      // ProseMirror's contenteditable has no implicit role; name it so the
      // expanded body stays the same "Take a note…" control as the collapsed row.
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('takeANote') },
    },
    onUpdate: () => setDraftTick((n) => n + 1),
  });

  // Mirror the in-progress draft (trailing 300 ms). Cleared on create ack,
  // explicit discard or empty-note discard — never by reset(), which runs
  // before the create resolves.
  // biome-ignore lint/correctness/useExhaustiveDependencies: draftTick re-arms the mirror when the TipTap body (non-React state) changes
  useEffect(() => {
    if (!expanded) return;
    const timer = setTimeout(() => {
      const bodyHtml = mode === 'text' && editor && !editor.isEmpty ? editor.getHTML() : '';
      const items = listRows
        .map((r) => r.text)
        .filter((x) => x.trim() !== '')
        .map((text) => ({ text, checked: false, indent: 0 as const }));
      const hasContent = title.trim() !== '' || bodyHtml !== '' || items.length > 0;
      if (!hasContent) {
        if (!savingRef.current) clearComposerDraft();
        return;
      }
      draftIdRef.current ??= m.newNoteId();
      saveComposerDraft({
        note: {
          id: draftIdRef.current,
          type: mode,
          title: title.trim(),
          bodyHtml,
          items,
          pinned,
          color,
          background,
        },
        labelIds,
        reminder,
        invites,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [
    expanded,
    mode,
    title,
    listRows,
    pinned,
    color,
    background,
    reminder,
    labelIds,
    invites,
    draftTick,
    editor,
    m.newNoteId,
  ]);

  const reset = () => {
    setExpanded(false);
    setMode('text');
    setTitle('');
    editor?.commands.clearContent();
    setListRows([]);
    setPinned(false);
    setColor('default');
    setBackground('none');
    setReminder(null);
    setLabelIds([]);
    setInvites([]);
    setImages((prev) => {
      for (const img of prev) URL.revokeObjectURL(img.url);
      return [];
    });
    setShowFormatBar(false);
    setShowShare(false);
    setLabelPicker({ open: false, seed: '' });
  };

  const save = async ({ archive = false } = {}) => {
    const items = listRows
      .map((r) => r.text)
      .filter((x) => x.trim() !== '')
      .map((text) => ({ text, checked: false, indent: 0 as const }));
    const bodyHtml = mode === 'text' && editor && !editor.isEmpty ? editor.getHTML() : '';
    // Snapshot the draft: reset() runs before the create resolves.
    const draft = {
      type: mode,
      title: title.trim(),
      bodyHtml,
      items,
      pinned,
      color,
      background,
      reminder,
      labelIds,
      files: images.map((img) => img.file),
      invites,
    };
    const hasContent =
      draft.title !== '' ||
      (mode === 'text' ? bodyHtml !== '' : items.length > 0) ||
      draft.files.length > 0;
    const wasExpanded = expanded;
    // Reuse the mirrored draft id so the queued create and the draft agree;
    // savingRef keeps the mirror-clear path quiet while reset() empties state.
    savingRef.current = true;
    const id = draftIdRef.current ?? m.newNoteId();
    draftIdRef.current = null;
    reset();

    if (!hasContent) {
      savingRef.current = false;
      clearComposerDraft();
      if (wasExpanded) show({ message: t('emptyNoteDiscarded') });
      return;
    }

    const note = await m.create
      .mutateAsync({
        id,
        type: draft.type,
        title: draft.title,
        bodyHtml: draft.bodyHtml,
        items: draft.items,
        pinned: draft.pinned,
        color: draft.color,
        background: draft.background,
      })
      // Failure feedback (toast + retry) comes from the mutation's onError.
      .catch(() => null);
    savingRef.current = false;
    if (!note) return;

    if (draft.reminder) reminderM.set.mutate({ noteId: id, body: draft.reminder });
    for (const labelId of draft.labelIds)
      labelM.setNoteLabel.mutate({ noteId: id, labelId, on: true });
    for (const file of draft.files) attachmentM.upload.mutate({ noteId: id, file });
    for (const inv of draft.invites)
      collaboratorM.invite.mutate({ noteId: id, email: inv.email, role: inv.role });
    if (archive) m.archiveWithUndo(note);
  };

  const startList = () => {
    const key = crypto.randomUUID();
    setMode('list');
    setListRows([{ key, text: '' }]);
    // Keep opens a new list with the caret already in its first item.
    focusRowRef.current = key;
    setExpanded(true);
  };

  // Keep's "New note with drawing": straight to the drawing editor — the note
  // is only created when ink is actually saved.
  const startDrawing = () =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, drawing: 'new' }),
      resetScroll: false,
    });

  const addImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Read the FileList here, not inside the state updater: the caller resets
    // the input right after (`value = ''`), which empties the live FileList
    // before React would run a lazy updater — the picked files would vanish.
    const picked = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...picked]);
    setExpanded(true);
  };

  const removeImage = (key: string) =>
    setImages((prev) => {
      const hit = prev.find((i) => i.key === key);
      if (hit) URL.revokeObjectURL(hit.url);
      return prev.filter((i) => i.key !== key);
    });

  // Click-away saves (Keep behavior). Popover portals live outside the root,
  // so ignore clicks inside any [data-composer-popover]; modal dialogs cover
  // the page entirely, so the listener stands down while one is open.
  useEffect(() => {
    if (!expanded || showShare) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-composer-popover]')) return;
      void save();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  });

  // Keep focuses the composer on load.
  useEffect(() => {
    collapsedRef.current?.focus({ preventScroll: true });
  }, []);

  // Keyboard shortcuts: c → compose note, l → compose list.
  useEffect(() => {
    const onCompose = (e: Event) => {
      const kind = (e as CustomEvent<string>).detail;
      if (kind === 'list') startList();
      else {
        setMode('text');
        setExpanded(true);
      }
      window.scrollTo({ top: 0 });
    };
    document.addEventListener('openkeep:compose', onCompose);
    return () => document.removeEventListener('openkeep:compose', onCompose);
  });

  useEffect(() => {
    if (expanded && mode === 'text') editor?.commands.focus('end');
  }, [expanded, mode, editor]);

  // Object URLs outlive React state, so revoke whatever is left on unmount.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () => {
      for (const img of imagesRef.current) URL.revokeObjectURL(img.url);
    },
    [],
  );

  const isDefaultColor = color === 'default';

  // The draft's collaborator list: me as owner + the pending invitations.
  const draftCollaborators: Collaborator[] = [
    ...(session
      ? [
          {
            userId: session.user.id,
            email: session.user.email,
            name: session.user.name,
            role: 'owner' as const,
          },
        ]
      : []),
    ...invites.map((inv) => ({
      userId: `pending:${inv.email}`,
      email: inv.email,
      name: inv.email,
      role: inv.role,
    })),
  ];

  const addItemsToBottom = settings?.addItemsToBottom ?? true;
  const addListRowButton = (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-1 py-2 text-on-surface-variant hover:text-on-surface"
      onClick={() => addListRow(addItemsToBottom ? (listRows.at(-1)?.key ?? null) : null)}
    >
      <Icon svg={addSvg} size={20} />
      <span className="text-sm">{t('editor:listItemPlaceholder')}</span>
    </button>
  );

  return (
    <div className="mx-auto mt-8 mb-6 w-full max-w-[600px] px-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: shortcuts bubble up from the inner inputs */}
      <div
        ref={rootRef}
        data-no-marquee
        className="rounded-lg border shadow-(--elevation-2)"
        style={{
          background: `var(--note-${color})`,
          borderColor: isDefaultColor ? 'var(--outline)' : 'transparent',
        }}
        onKeyDown={(e) => {
          if (expanded && (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey))) {
            e.preventDefault();
            void save();
          }
        }}
      >
        {!expanded ? (
          <div className="flex items-center py-1 pr-2 pl-4">
            <input
              ref={collapsedRef}
              type="text"
              placeholder={t('takeANote')}
              aria-label={t('takeANote')}
              className="h-10 w-full bg-transparent font-medium text-[0.95rem] text-on-surface outline-none placeholder:text-on-surface-variant"
              onClick={() => setExpanded(true)}
              onKeyDown={(e) => {
                // Focused on load (Keep) but expands only on click/typing.
                if (e.key.length === 1 || e.key === 'Enter') {
                  e.preventDefault();
                  if (e.key.length === 1) editor?.commands.insertContent(e.key);
                  setExpanded(true);
                }
              }}
              readOnly
            />
            <IconButton
              svg={checkboxSvg}
              label={t('newList')}
              className="text-on-surface-variant"
              onClick={startList}
            />
            <IconButton
              svg={brushSvg}
              label={t('newNoteWithDrawing')}
              className="text-on-surface-variant"
              onClick={startDrawing}
            />
            <IconButton
              svg={imageSvg}
              label={t('newNoteWithImage')}
              className="text-on-surface-variant"
              onClick={() => newNoteImageRef.current?.click()}
            />
            {hasTemplates && (
              <IconButton
                svg={noteStackSvg}
                label={t('newFromTemplate')}
                className="text-on-surface-variant"
                onClick={() => setShowTemplates(true)}
              />
            )}
            <input
              ref={newNoteImageRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {images.length > 0 && (
              <div className="overflow-hidden rounded-t-lg">
                {images.map((img) => (
                  <div key={img.key} className="group/img relative">
                    <img src={img.url} alt="" className="block h-auto w-full" />
                    <div className="absolute right-1 bottom-1 opacity-0 transition-opacity group-hover/img:opacity-100">
                      <IconButton
                        svg={closeSvg}
                        label={t('removeImage')}
                        size={32}
                        iconSize={16}
                        className="bg-(--scrim) text-white hover:bg-black/70"
                        onClick={() => removeImage(img.key)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('title')}
                aria-label={t('title')}
                maxLength={999}
                className="w-full bg-transparent px-4 pt-3 pb-2 font-semibold text-[1.25rem] text-on-surface outline-none placeholder:text-on-surface-variant"
              />
              <div className="pt-1.5 pr-1.5">
                <IconButton
                  svg={pinned ? pinFilledSvg : pinSvg}
                  label={pinned ? t('unpinNote') : t('pinNote')}
                  size={38}
                  iconSize={20}
                  className="text-on-surface-variant"
                  onClick={() => setPinned((p) => !p)}
                />
              </div>
            </div>
            {mode === 'text' ? (
              <div className="max-h-[60vh] overflow-y-auto px-4 pb-3">
                <EditorContent editor={editor} className="note-editor" />
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto px-3 pb-3">
                {!addItemsToBottom && addListRowButton}
                {displayedRows.map((row) => (
                  <ComposerListRow
                    key={row.key}
                    row={row}
                    dragging={dragRowKey === row.key}
                    canRemove={listRows.length > 1}
                    inputRefs={listInputRefs}
                    rowRefs={listRowRefs}
                    onDragStart={() => setDragRowKey(row.key)}
                    onText={(key, text) =>
                      setListRows((rows) => rows.map((r) => (r.key === key ? { ...r, text } : r)))
                    }
                    onEnter={(key) => addListRow(key)}
                    onBackspace={(key) => {
                      const idx = listRows.findIndex((r) => r.key === key);
                      const prev = listRows[idx - 1];
                      if (prev) focusRowRef.current = prev.key;
                      removeListRow(key);
                    }}
                    onRemove={removeListRow}
                  />
                ))}
                {addItemsToBottom && addListRowButton}
              </div>
            )}

            <ReminderChip
              reminder={reminder}
              picker={(close) => (
                <ReminderPicker
                  reminder={reminder}
                  onApply={setReminder}
                  onDelete={() => setReminder(null)}
                  onDone={close}
                />
              )}
            />
            <LabelChips
              labelIds={labelIds}
              onRemove={(labelId) => setLabelIds((ids) => ids.filter((x) => x !== labelId))}
            />

            {showFormatBar && editor && <FormatBar editor={editor} />}

            <div className="flex items-center gap-0.5 px-2 py-1.5">
              <IconButton
                svg={personAddSvg}
                label={t('sharing:collaborator')}
                size={36}
                iconSize={18}
                className="text-on-surface-variant"
                onClick={() => setShowShare(true)}
              />
              <Popover.Root>
                <Popover.Trigger
                  aria-label={t('reminders:addReminder')}
                  data-tooltip={t('reminders:addReminder')}
                  className={iconButtonClass}
                  style={{ width: 36, height: 36 }}
                >
                  <Icon svg={addAlertSvg} size={18} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner className="z-50" sideOffset={4}>
                    <Popover.Popup
                      data-composer-popover
                      className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)"
                    >
                      <ComposerReminderPop reminder={reminder} onChange={setReminder} />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
              {mode === 'text' && (
                <IconButton
                  svg={formatSvg}
                  label={t('editor:formattingOptions')}
                  size={36}
                  iconSize={18}
                  className={`text-on-surface-variant ${showFormatBar ? 'bg-(--surface-hover)' : ''}`}
                  onClick={() => setShowFormatBar((v) => !v)}
                />
              )}
              <Popover.Root>
                <Popover.Trigger
                  aria-label={t('backgroundOptions')}
                  data-tooltip={t('backgroundOptions')}
                  className={iconButtonClass}
                  style={{ width: 36, height: 36 }}
                >
                  <Icon svg={paletteSvg} size={18} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner className="z-50" sideOffset={4}>
                    <Popover.Popup
                      data-composer-popover
                      className="z-40 rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)"
                    >
                      <ColorPicker
                        color={color}
                        background={background}
                        onColor={setColor}
                        onBackground={setBackground}
                      />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
              <IconButton
                svg={imageSvg}
                label={t('addImage')}
                size={36}
                iconSize={18}
                className="text-on-surface-variant"
                onClick={() => imageInputRef.current?.click()}
              />
              <input
                ref={imageInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  addImages(e.target.files);
                  e.target.value = '';
                }}
              />
              <IconButton
                svg={archiveSvg}
                label={t('shell:navArchive')}
                size={36}
                iconSize={18}
                className="text-on-surface-variant"
                onClick={() => void save({ archive: true })}
              />
              <Menu.Root>
                <Menu.Trigger
                  aria-label={t('more')}
                  data-tooltip={t('more')}
                  className={iconButtonClass}
                  style={{ width: 36, height: 36 }}
                >
                  <Icon svg={moreSvg} size={18} />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="z-50" sideOffset={2}>
                    <Menu.Popup
                      data-composer-popover
                      className="min-w-44 rounded-lg border border-(--outline-variant) bg-surface py-1.5 shadow-(--elevation-3)"
                    >
                      <Menu.Item
                        className={menuItemClass}
                        onClick={() => {
                          reset();
                          clearComposerDraft();
                          draftIdRef.current = null;
                        }}
                      >
                        {t('deleteNote')}
                      </Menu.Item>
                      <Menu.Item
                        className={menuItemClass}
                        onClick={() => setLabelPicker({ open: true, seed: '' })}
                      >
                        {labelIds.length > 0 ? t('labels:changeLabels') : t('labels:addLabel')}
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
              <IconButton
                svg={undoSvg}
                label={t('editor:undo')}
                size={36}
                iconSize={18}
                className="text-on-surface-variant"
                disabled={mode !== 'text' || !editor?.can().undo()}
                onClick={() => editor?.chain().focus().undo().run()}
              />
              <IconButton
                svg={redoSvg}
                label={t('editor:redo')}
                size={36}
                iconSize={18}
                className="text-on-surface-variant"
                disabled={mode !== 'text' || !editor?.can().redo()}
                onClick={() => editor?.chain().focus().redo().run()}
              />
              <button
                type="button"
                onClick={() => void save()}
                className="ml-auto rounded px-6 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
              >
                {t('common:close')}
              </button>
            </div>

            <ShareDialog
              open={showShare}
              onOpenChange={setShowShare}
              collaborators={draftCollaborators}
              isOwner
              onInvite={(email, role) =>
                setInvites((prev) =>
                  prev.some((i) => i.email === email) ? prev : [...prev, { email, role }],
                )
              }
              onRole={(userId, role) =>
                setInvites((prev) =>
                  prev.map((i) => (`pending:${i.email}` === userId ? { ...i, role } : i)),
                )
              }
              onRemove={(userId) =>
                setInvites((prev) => prev.filter((i) => `pending:${i.email}` !== userId))
              }
            />
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
                    <Popover.Popup
                      data-composer-popover
                      className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)"
                    >
                      <NotePicker
                        excludeId={draftIdRef.current}
                        onPick={(target) => {
                          setNotePicker(false);
                          pickNoteLink(editor, target, t('editor:untitled'));
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
                    <Popover.Popup
                      data-composer-popover
                      className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)"
                    >
                      <LabelPicker
                        initialFilter={labelPicker.seed}
                        selectedIds={labelIds}
                        onToggle={(labelId, on) =>
                          setLabelIds((ids) =>
                            on ? [...new Set([...ids, labelId])] : ids.filter((x) => x !== labelId),
                          )
                        }
                      />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            )}
          </div>
        )}
      </div>
      <TemplatePickerDialog open={showTemplates} onOpenChange={setShowTemplates} />
    </div>
  );
}

interface ComposerListRowProps {
  row: { key: string; text: string };
  dragging: boolean;
  /** The last row keeps its close button hidden: a list is never empty here. */
  canRemove: boolean;
  inputRefs: React.RefObject<Map<string, HTMLInputElement>>;
  /** The row boxes the reorder animation measures. */
  rowRefs: React.RefObject<Map<string, HTMLElement>>;
  onDragStart: () => void;
  onText: (key: string, text: string) => void;
  onEnter: (key: string) => void;
  onBackspace: (key: string) => void;
  onRemove: (key: string) => void;
}

/**
 * One row of the composer's list. The checkbox is inert (nothing is checkable
 * before the note exists) — the handle beside it is not: it reorders the row,
 * the same gesture the editor's checklist uses once the note is real.
 */
function ComposerListRow({
  row,
  dragging,
  canRemove,
  inputRefs,
  rowRefs,
  onDragStart,
  onText,
  onEnter,
  onBackspace,
  onRemove,
}: ComposerListRowProps) {
  const { t } = useTranslation('notes');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    const handle = handleRef.current;
    if (!el || !handle) return;
    const cleanups = [
      dropTargetForElements({ element: el, getData: () => ({ rowKey: row.key }) }),
      draggable({
        element: el,
        dragHandle: handle,
        getInitialData: () => ({ rowKey: row.key, composerRow: true }),
        onGenerateDragPreview: ({ nativeSetDragImage, location }) =>
          liftedRowPreview({ nativeSetDragImage, element: el, input: location.current.input }),
        onDragStart,
      }),
    ];
    return () => {
      for (const c of cleanups) c();
    };
  }, [row.key, onDragStart]);

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        if (el) rowRefs.current.set(row.key, el);
        else rowRefs.current.delete(row.key);
      }}
      className={`group/crow flex items-center gap-1 py-0.5 ${dragging ? 'opacity-0' : ''}`}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={t('editor:dragItem')}
        className="cursor-grab text-on-surface-variant opacity-60 hover:opacity-100"
        tabIndex={-1}
      >
        <Icon svg={dragSvg} size={18} />
      </button>
      <input type="checkbox" disabled className="h-4 w-4 flex-none opacity-60" />
      <input
        ref={(el) => {
          if (el) inputRefs.current.set(row.key, el);
          else inputRefs.current.delete(row.key);
        }}
        type="text"
        value={row.text}
        placeholder={t('editor:listItemPlaceholder')}
        aria-label={t('editor:listItemPlaceholder')}
        className="w-full border-transparent border-b bg-transparent px-1 py-1 text-[0.875rem] text-on-surface outline-none focus:border-(--outline)"
        onChange={(e) => onText(row.key, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onEnter(row.key);
          } else if (e.key === 'Backspace' && row.text === '' && canRemove) {
            e.preventDefault();
            onBackspace(row.key);
          }
        }}
      />
      {canRemove && (
        <IconButton
          svg={closeSvg}
          label={t('editor:deleteItem')}
          size={28}
          iconSize={16}
          className="opacity-0 group-hover/crow:opacity-100"
          onClick={() => onRemove(row.key)}
        />
      )}
    </div>
  );
}

/** The draft reminder picker inside an uncontrolled popover. */
function ComposerReminderPop({
  reminder,
  onChange,
}: {
  reminder: SetReminder | null;
  onChange: (r: SetReminder | null) => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <Popover.Close ref={closeRef} className="hidden" />
      <ReminderPicker
        reminder={reminder}
        onApply={onChange}
        onDelete={() => onChange(null)}
        onDone={() => closeRef.current?.click()}
      />
    </>
  );
}
