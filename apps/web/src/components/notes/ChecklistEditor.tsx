import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { DragLocationHistory } from '@atlaskit/pragmatic-drag-and-drop/types';
import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import dragSvg from '@material-symbols/svg-700/outlined/drag_indicator.svg?raw';
import chevronSvg from '@material-symbols/svg-700/outlined/keyboard_arrow_down.svg?raw';
import type { FullNote, NoteItem, PatchItemInput } from '@openkeep/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useReorderFlip } from '../../hooks/use-reorder-flip.js';
import { clearDraftItems, saveNoteDraftItems } from '../../lib/drafts.js';
import { liftedRowPreview } from '../../lib/drag-preview.js';
import type { HistoryItem } from '../../lib/field-history.js';
import {
  createItemApi,
  deleteCheckedApi,
  deleteItemApi,
  patchItemApi,
  uncheckAllApi,
  updateCachedItems,
} from '../../lib/items-api.js';
import { dropSlot, moveToSlot } from '../../lib/reorder.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';
import type { ChecklistRow } from './checklist-logic.js';
import {
  applyCheck,
  byPosition,
  canIndent,
  displayGroups,
  indentFromDragX,
  moveWithinGroup,
  nextSelectedKey,
  positionAfterRow,
  positionAtIndex,
  selectableRows,
  splitText,
} from './checklist-logic.js';

/**
 * How far right (negative: left) the pointer has travelled from the drag
 * handle it grabbed — the horizontal half of the drop gesture.
 */
function dragTravelX(data: Record<string, unknown>, location: DragLocationHistory): number {
  const originX = typeof data.originX === 'number' ? data.originX : location.initial.input.clientX;
  return location.current.input.clientX - originX;
}

/**
 * The slot the pointer is over right now — an index into `group` with the
 * dragged row lifted out, or null when the gesture names no new slot (see
 * `dropSlot`), which leaves the preview showing the slot it already had.
 */
function slotUnderPointer(
  group: readonly ChecklistRow[],
  dragKey: string,
  location: DragLocationHistory,
): number | null {
  const target = location.current.dropTargets[0];
  const overKey = target?.data.rowKey;
  if (!target || typeof overKey !== 'string') return null;
  const rect = (target.element as HTMLElement).getBoundingClientRect();
  const clientY = location.current.input.clientY ?? rect.top + rect.height / 2;
  return dropSlot(group, dragKey, overKey, clientY < rect.top + rect.height / 2);
}

export interface ChecklistHandle {
  uncheckAll: () => void;
  deleteChecked: () => void;
  hasChecked: () => boolean;
  /** The rows as they read right now — one half of an undo step. */
  snapshot: () => HistoryItem[];
  /** Put the rows back the way a step remembers them (undo/redo). */
  restore: (items: readonly HistoryItem[]) => void;
  /** `n` / `p`: walk the non-typing item selection (1 = down, -1 = up). */
  selectItem: (delta: 1 | -1) => void;
  /** `Shift+N` / `Shift+P`: move the selected item one slot. */
  moveItem: (delta: 1 | -1) => void;
}

/** Rows → the shape an undo step remembers (no server ids: see field-history). */
function toHistoryItems(rows: readonly ChecklistRow[]): HistoryItem[] {
  return rows.map((r) => ({
    key: r.key,
    text: r.text,
    checked: r.checked,
    indent: r.indent,
    position: r.position,
  }));
}

/**
 * Which rows the find bar hit, and which one is the current match. Item text
 * lives in a native textarea, so the row is highlighted as a whole — the words
 * themselves can only be marked up in the rich-text body.
 */
export interface ChecklistFind {
  hits: ReadonlySet<string>;
  current: string | null;
}

interface ChecklistEditorProps {
  note: FullNote;
  readOnly: boolean;
  moveCheckedToBottom: boolean;
  addItemsToBottom: boolean;
  handleRef?: React.Ref<ChecklistHandle>;
  find?: ChecklistFind;
  /**
   * A local edit just landed: the rows it produced, and the field it happened
   * in (null when the change is structural, which never coalesces).
   */
  onStep?: (items: HistoryItem[], groupKey: string | null) => void;
}

/**
 * The Keep checklist editor. Rows live in LOCAL state while the editor is
 * open (source of truth for typing); every change syncs to the item-level
 * endpoints, serialized per row so edits to a just-created row wait for its
 * server id. The ['notes'] cache is updated after each server ack.
 */
export function ChecklistEditor({
  note,
  readOnly,
  moveCheckedToBottom,
  addItemsToBottom,
  handleRef,
  find,
  onStep,
}: ChecklistEditorProps) {
  const { t } = useTranslation('editor');
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const noteId = note.id;

  const [rows, setRows] = useState<ChecklistRow[]>(() =>
    note.items.map((i) => ({
      key: i.id,
      id: i.id,
      text: i.text,
      checked: i.checked,
      indent: i.indent,
      position: i.position,
    })),
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const [collapsed, setCollapsed] = useState(false);
  /**
   * The "selected item" `n`/`p`/`Shift+N`/`Shift+P` operate on — a focus that
   * does NOT type: the row's own box holds it, not the textarea inside it, so
   * the letters stay shortcuts instead of becoming text (see keyboard.ts).
   */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const creations = useRef(new Map<string, Promise<string | null>>());
  const textTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const focusRequest = useRef<{ key: string; caret: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Rows with a PATCH in flight — the remote merge must not revert them. */
  const pendingPatch = useRef(new Map<string, number>());
  /** True after any local edit — gates the draft mirror below. */
  const dirtiedRef = useRef(false);
  /**
   * Set by a local op just before it changes the rows, and consumed by the
   * effect that reports the step. Reporting from an effect rather than from
   * the op is what makes a step the rows React actually committed — several
   * ops in one batch (Enter, which splits a row, is two) are one step, and a
   * `setRows` nobody asked for (the remote merge, a restore, an id landing
   * from the server) leaves the marker unset and is not a step at all.
   */
  const pendingStepRef = useRef<{ key: string | null } | null>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const step = pendingStepRef.current;
    pendingStepRef.current = null;
    if (!step) return;
    onStepRef.current?.(toHistoryItems(rows), step.key);
  }, [rows]);

  const beginPatch = useCallback((key: string) => {
    pendingPatch.current.set(key, (pendingPatch.current.get(key) ?? 0) + 1);
  }, []);
  const endPatch = useCallback((key: string) => {
    const n = pendingPatch.current.get(key) ?? 0;
    if (n <= 1) pendingPatch.current.delete(key);
    else pendingPatch.current.set(key, n - 1);
  }, []);

  // ---------------------------------------------------------------- sync

  const withServerId = useCallback((key: string, fn: (id: string) => void) => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (row?.id) {
      fn(row.id);
      return;
    }
    void creations.current.get(key)?.then((id) => {
      if (id) fn(id);
    });
  }, []);

  const cacheUpsert = useCallback(
    (item: NoteItem) => {
      updateCachedItems(queryClient, noteId, (items) => {
        const idx = items.findIndex((i) => i.id === item.id);
        if (idx === -1) return [...items, item];
        const next = [...items];
        next[idx] = item;
        return next;
      });
    },
    [queryClient, noteId],
  );

  const cacheRemove = useCallback(
    (itemId: string) => {
      updateCachedItems(queryClient, noteId, (items) => items.filter((i) => i.id !== itemId));
    },
    [queryClient, noteId],
  );

  const patchServer = useCallback(
    (key: string, patch: Parameters<typeof patchItemApi>[2]) => {
      beginPatch(key);
      withServerId(key, (id) => {
        void patchItemApi(noteId, id, patch)
          .then((result) => {
            cacheUpsert(result.item);
            for (const c of result.cascaded) cacheUpsert(c);
          })
          .catch(() => show({ message: t('common:saveFailed') }))
          .finally(() => endPatch(key));
      });
    },
    [withServerId, noteId, cacheUpsert, beginPatch, endPatch, show, t],
  );

  const scheduleTextSync = useCallback(
    (key: string, text: string) => {
      const existing = textTimers.current.get(key);
      if (existing) clearTimeout(existing);
      textTimers.current.set(
        key,
        setTimeout(() => {
          textTimers.current.delete(key);
          patchServer(key, { text });
        }, 400),
      );
    },
    [patchServer],
  );

  // Flush pending text syncs on unmount/close.
  useEffect(
    () => () => {
      for (const [key, timer] of textTimers.current) {
        clearTimeout(timer);
        const row = rowsRef.current.find((r) => r.key === key);
        if (row) patchServer(key, { text: row.text });
      }
      textTimers.current.clear();
    },
    [patchServer],
  );

  // Mirror local rows to the draft store after any local edit; the boot-time
  // reconcile replays whatever never reached the server (see drafts.ts).
  useEffect(() => {
    if (!dirtiedRef.current || readOnly) return;
    saveNoteDraftItems(
      noteId,
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        text: r.text,
        checked: r.checked,
        indent: r.indent,
        position: r.position,
      })),
    );
  }, [rows, noteId, readOnly]);

  // On close, drop the mirror only when nothing is left unsynced — otherwise
  // it stays for the boot-time reconcile to deliver.
  useEffect(
    () => () => {
      if (
        dirtiedRef.current &&
        navigator.onLine &&
        rowsRef.current.every((r) => r.id !== null) &&
        textTimers.current.size === 0 &&
        pendingPatch.current.size === 0
      ) {
        clearDraftItems(noteId);
      }
    },
    [noteId],
  );

  // ---------------------------------------------------------------- ops

  const addRow = useCallback(
    (afterKey: string | null, seedText = '', indent: 0 | 1 = 0, caret = 0) => {
      dirtiedRef.current = true;
      pendingStepRef.current = { key: null };
      const key = crypto.randomUUID();
      const position = positionAfterRow(rowsRef.current, afterKey);
      const row: ChecklistRow = { key, id: null, text: seedText, checked: false, indent, position };
      setRows((prev) => [...prev, row]);
      focusRequest.current = { key, caret };

      const creation = createItemApi(noteId, { text: seedText, checked: false, indent, position })
        .then((item) => {
          setRows((prev) => prev.map((r) => (r.key === key ? { ...r, id: item.id } : r)));
          const current = rowsRef.current.find((r) => r.key === key);
          cacheUpsert({ ...item, text: current?.text ?? item.text });
          return item.id;
        })
        .catch(() => {
          // Keep the row local (id null): typing continues and the draft
          // mirror recreates it at next boot; it just can't sync this session.
          show({ message: t('common:saveFailed') });
          return null;
        });
      creations.current.set(key, creation);
      return key;
    },
    [noteId, cacheUpsert, show, t],
  );

  const changeText = useCallback(
    (key: string, text: string) => {
      dirtiedRef.current = true;
      pendingStepRef.current = { key: `item:${key}` };
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, text } : r)));
      scheduleTextSync(key, text);
    },
    [scheduleTextSync],
  );

  const toggleCheck = useCallback(
    (key: string, checked: boolean) => {
      dirtiedRef.current = true;
      pendingStepRef.current = { key: null };
      // Cascaded rows (parent auto-check) are pending too until the ack lands,
      // so the remote merge can't briefly revert them.
      const next = applyCheck(rowsRef.current, key, checked).rows;
      const affected = next
        .filter((r) => rowsRef.current.find((p) => p.key === r.key)?.checked !== r.checked)
        .map((r) => r.key);
      for (const k of affected) beginPatch(k);
      setRows(next);
      withServerId(key, (id) => {
        void patchItemApi(noteId, id, { checked })
          .then((result) => {
            cacheUpsert(result.item);
            for (const c of result.cascaded) cacheUpsert(c);
          })
          .catch(() => show({ message: t('common:saveFailed') }))
          .finally(() => {
            for (const k of affected) endPatch(k);
          });
      });
    },
    [withServerId, noteId, cacheUpsert, beginPatch, endPatch, show, t],
  );

  const setIndent = useCallback(
    (key: string, indent: 0 | 1) => {
      if (indent === 1 && !canIndent(rowsRef.current, key)) return;
      dirtiedRef.current = true;
      pendingStepRef.current = { key: null };
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, indent } : r)));
      patchServer(key, { indent });
    },
    [patchServer],
  );

  const removeRow = useCallback(
    (key: string, focusPrev = false) => {
      dirtiedRef.current = true;
      pendingStepRef.current = { key: null };
      const ordered = [...rowsRef.current].sort(byPosition);
      const idx = ordered.findIndex((r) => r.key === key);
      const prev = ordered[idx - 1];
      const row = ordered[idx];
      if (!row) return;
      if (focusPrev && prev) {
        focusRequest.current = { key: prev.key, caret: prev.text.length };
      }
      setRows((list) => list.filter((r) => r.key !== key));
      const timer = textTimers.current.get(key);
      if (timer) clearTimeout(timer);
      textTimers.current.delete(key);
      withServerId(key, (id) => {
        void deleteItemApi(noteId, id)
          .then(() => cacheRemove(id))
          .catch(() => show({ message: t('common:saveFailed') }));
      });
    },
    [withServerId, noteId, cacheRemove, show, t],
  );

  const splitRow = useCallback(
    (key: string, caret: number) => {
      const row = rowsRef.current.find((r) => r.key === key);
      if (!row) return;
      const [head, tail] = splitText(row.text, caret);
      changeText(key, head);
      addRow(key, tail, row.indent, 0);
    },
    [changeText, addRow],
  );

  const mergeIntoPrevious = useCallback(
    (key: string) => {
      const ordered = [...rowsRef.current].sort(byPosition);
      const idx = ordered.findIndex((r) => r.key === key);
      const prev = ordered[idx - 1];
      const row = ordered[idx];
      if (!prev || !row) return;
      const junction = prev.text.length;
      changeText(prev.key, prev.text + row.text);
      focusRequest.current = { key: prev.key, caret: junction };
      removeRow(key);
    },
    [changeText, removeRow],
  );

  // ------------------------------------------------------------- selection

  /** The rows on screen right now, in screen order — what `n`/`p` walk. */
  const selectableNow = useCallback(
    () => selectableRows(displayGroups(rowsRef.current, moveCheckedToBottom), collapsed),
    [moveCheckedToBottom, collapsed],
  );

  const selectItem = useCallback(
    (delta: 1 | -1) => {
      const selectable = selectableNow();
      setSelectedKey((current) => nextSelectedKey(selectable, current, delta));
    },
    [selectableNow],
  );

  const moveItem = useCallback(
    (delta: 1 | -1) => {
      const key = selectedKeyRef.current;
      if (readOnly || !key) return;
      const rows = rowsRef.current;
      const row = rows.find((r) => r.key === key);
      if (!row) return;
      // A row moves inside the group it is displayed in; `Shift+N` on the last
      // unchecked row does not push it under the completed divider.
      const groups = displayGroups(rows, moveCheckedToBottom);
      const group = groups.checked.some((r) => r.key === key) ? groups.checked : groups.unchecked;
      const patch = moveWithinGroup(rows, group, key, delta);
      if (!patch) return;
      dirtiedRef.current = true;
      pendingStepRef.current = { key: null };
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
      patchServer(key, patch);
    },
    [readOnly, moveCheckedToBottom, patchServer],
  );

  /**
   * Escape inside an item's textarea: step out of the field onto the item
   * itself. Without it the selection would be unreachable from where people
   * actually are — the editor opens with a field focused, and every bare
   * letter belongs to that field.
   */
  const selectRow = useCallback((key: string) => setSelectedKey(key), []);

  /** Enter on a selected row: hand the keystrokes back to its textarea. */
  const editSelected = useCallback((key: string) => {
    const row = rowsRef.current.find((r) => r.key === key);
    if (!row) return;
    focusRequest.current = { key, caret: row.text.length };
    setSelectedKey(null);
  }, []);

  const deselect = useCallback((key: string) => {
    setSelectedKey((current) => (current === key ? null : current));
  }, []);

  /**
   * Put the rows back the way an undo/redo step remembers them. Rows are
   * matched by local key, so a row the step brings back is created afresh
   * server-side under the key later steps already point at; everything else
   * is the smallest patch that makes the row read like the snapshot.
   */
  const restore = useCallback(
    (snapshot: readonly HistoryItem[]) => {
      dirtiedRef.current = true;
      const current = rowsRef.current;
      const byKey = new Map(current.map((r) => [r.key, r]));
      const wanted = new Set(snapshot.map((s) => s.key));
      const dropTimer = (key: string) => {
        const timer = textTimers.current.get(key);
        if (timer) clearTimeout(timer);
        textTimers.current.delete(key);
      };

      for (const row of current) {
        if (wanted.has(row.key)) continue;
        // A debounced text for a row that is going away would otherwise land
        // as a PATCH on an id the DELETE has already taken.
        dropTimer(row.key);
        withServerId(row.key, (id) => {
          void deleteItemApi(noteId, id)
            .then(() => cacheRemove(id))
            .catch(() => show({ message: t('common:saveFailed') }));
        });
      }

      setRows(
        snapshot.map((s) => ({
          key: s.key,
          id: byKey.get(s.key)?.id ?? null,
          text: s.text,
          checked: s.checked,
          indent: s.indent,
          position: s.position,
        })),
      );

      for (const s of snapshot) {
        const row = byKey.get(s.key);
        if (!row) {
          const creation = createItemApi(noteId, {
            text: s.text,
            checked: s.checked,
            indent: s.indent,
            position: s.position,
          })
            .then((item) => {
              setRows((prev) => prev.map((r) => (r.key === s.key ? { ...r, id: item.id } : r)));
              const live = rowsRef.current.find((r) => r.key === s.key);
              cacheUpsert({ ...item, text: live?.text ?? item.text });
              return item.id;
            })
            .catch(() => {
              show({ message: t('common:saveFailed') });
              return null;
            });
          creations.current.set(s.key, creation);
          continue;
        }
        if (
          row.text === s.text &&
          row.checked === s.checked &&
          row.indent === s.indent &&
          row.position === s.position
        ) {
          continue;
        }
        dropTimer(s.key);
        patchServer(s.key, {
          text: s.text,
          checked: s.checked,
          indent: s.indent,
          position: s.position,
        });
      }
    },
    [noteId, withServerId, patchServer, cacheUpsert, cacheRemove, show, t],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      hasChecked: () => rowsRef.current.some((r) => r.checked),
      snapshot: () => toHistoryItems(rowsRef.current),
      restore,
      selectItem,
      moveItem,
      uncheckAll: () => {
        dirtiedRef.current = true;
        pendingStepRef.current = { key: null };
        setRows((prev) => prev.map((r) => ({ ...r, checked: false })));
        void uncheckAllApi(noteId).then((res) =>
          updateCachedItems(queryClient, noteId, () => res.items),
        );
      },
      deleteChecked: () => {
        dirtiedRef.current = true;
        pendingStepRef.current = { key: null };
        setRows((prev) => prev.filter((r) => !r.checked));
        void deleteCheckedApi(noteId).then((res) =>
          updateCachedItems(queryClient, noteId, () => res.items),
        );
      },
    }),
    [noteId, queryClient, restore, selectItem, moveItem],
  );

  // ---------------------------------------------------------------- dnd

  const [dragKey, setDragKey] = useState<string | null>(null);
  /**
   * Indent the current drag would apply on release. A 24px threshold is
   * invisible without it — the row shifts under the pointer so the gesture
   * announces itself before the drop.
   */
  const [dragIndent, setDragIndent] = useState<0 | 1 | null>(null);
  /**
   * Slot the current drag would land in. The list renders in that order while
   * the drag lasts — Keep's gesture is a live one: the row travels with the
   * pointer and the rest of the list opens the gap it is heading for, so the
   * drop only confirms what is already on screen.
   */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dropIndexRef = useRef(dropIndex);
  dropIndexRef.current = dropIndex;

  // ------------------------------------------------------------ remote merge
  // Collaborator edits land in the ['notes'] cache (WS deltas); fold them into
  // the open editor's rows, field-level LWW: anything locally dirty (pending
  // text debounce, in-flight PATCH, focused input, active drag) wins.
  useEffect(() => {
    setRows((prev) => {
      const byId = new Map(prev.filter((r) => r.id).map((r) => [r.id as string, r]));
      const localKeys = new Set(prev.map((r) => r.key));
      const remoteIds = new Set(note.items.map((i) => i.id));
      let changed = false;

      let next = prev;
      if (prev.some((r) => r.id && !remoteIds.has(r.id) && !pendingPatch.current.has(r.key))) {
        next = next.filter((r) => !r.id || remoteIds.has(r.id) || pendingPatch.current.has(r.key));
        changed = true;
      }

      const additions: ChecklistRow[] = [];
      for (const item of note.items) {
        const row = byId.get(item.id);
        if (!row) {
          if (!localKeys.has(item.id)) {
            additions.push({
              key: item.id,
              id: item.id,
              text: item.text,
              checked: item.checked,
              indent: item.indent,
              position: item.position,
            });
          }
          continue;
        }
        if (pendingPatch.current.has(row.key) || textTimers.current.has(row.key)) continue;
        const textLocked = document.activeElement === inputRefs.current.get(row.key);
        const text = textLocked ? row.text : item.text;
        const position = dragKey === row.key ? row.position : item.position;
        if (
          text !== row.text ||
          item.checked !== row.checked ||
          item.indent !== row.indent ||
          position !== row.position
        ) {
          next = next.map((r) =>
            r.key === row.key
              ? { ...r, text, checked: item.checked, indent: item.indent, position }
              : r,
          );
          changed = true;
        }
      }
      if (additions.length > 0) {
        next = [...next, ...additions];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [note.items, dragKey]);
  useEffect(() => {
    const el = listRef.current;
    if (!el || readOnly) return;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.noteId === noteId,
      onDrag: ({ source, location }) => {
        const key = source.data.rowKey as string;
        const row = rowsRef.current.find((r) => r.key === key);
        if (!row) return;
        const next = indentFromDragX(dragTravelX(source.data, location), row.indent);
        setDragIndent((prev) => (prev === next ? prev : next));
        const group = displayGroups(rowsRef.current, moveCheckedToBottom).unchecked;
        const slot = slotUnderPointer(group, key, location);
        if (slot !== null) setDropIndex((prev) => (prev === slot ? prev : slot));
      },
      onDrop: ({ source, location }) => {
        const key = source.data.rowKey as string;
        const group = displayGroups(rowsRef.current, moveCheckedToBottom).unchecked;
        // Released over no row at all (past the end of the list, over the "add
        // item" row): the gap the preview is holding open is the answer.
        const slot = slotUnderPointer(group, key, location) ?? dropIndexRef.current;
        setDragKey(null);
        setDragIndent(null);
        setDropIndex(null);
        const row = rowsRef.current.find((r) => r.key === key);
        if (!row) return;
        const patch: PatchItemInput = {};

        // Vertical half: the slot the preview has been showing all along.
        const from = group.findIndex((r) => r.key === key);
        if (slot !== null && slot !== from) {
          patch.position = positionAtIndex(group, key, slot);
        }

        // Horizontal half. The indent is judged against where the row LANDS,
        // not where it started: dragged right AND to the top of the list it is
        // now the first item, which Keep never indents.
        const landed = patch.position
          ? rowsRef.current.map((r) =>
              r.key === key ? { ...r, position: patch.position as string } : r,
            )
          : rowsRef.current;
        const desired =
          indentFromDragX(dragTravelX(source.data, location), row.indent) ?? row.indent;
        // The clamp also catches a plain reorder that drops an indented row at
        // the top: first item, indent 0, whatever the pointer did sideways.
        const nextIndent = desired === 1 && !canIndent(landed, key) ? 0 : desired;
        if (nextIndent !== row.indent) patch.indent = nextIndent;

        if (patch.position === undefined && patch.indent === undefined) return;
        pendingStepRef.current = { key: null };
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        patchServer(key, patch);
      },
    });
  }, [noteId, readOnly, patchServer, moveCheckedToBottom]);

  // ---------------------------------------------------------------- focus

  useLayoutEffect(() => {
    const req = focusRequest.current;
    if (!req) return;
    const el = inputRefs.current.get(req.key);
    if (el) {
      focusRequest.current = null;
      el.focus();
      el.setSelectionRange(req.caret, req.caret);
    }
  });

  // The selection IS a DOM focus — that is what keeps the next keystroke away
  // from any textarea, and what scrolls a row far down the list into view.
  useLayoutEffect(() => {
    if (selectedKey === null) return;
    rowRefs.current.get(selectedKey)?.focus();
  }, [selectedKey]);

  // A row that goes away (deleted here, or by a collaborator) takes the
  // selection with it rather than leaving `n` pointing at nothing.
  useEffect(() => {
    if (selectedKey !== null && !rows.some((r) => r.key === selectedKey)) setSelectedKey(null);
  }, [rows, selectedKey]);

  const groups = useMemo(
    () => displayGroups(rows, moveCheckedToBottom),
    [rows, moveCheckedToBottom],
  );
  const checkedCount = rows.filter((r) => r.checked).length;

  // The order on screen: the committed one, except mid-drag, where the dragged
  // row already sits in the slot it is heading for.
  const displayed = useMemo(
    () =>
      dragKey !== null && dropIndex !== null
        ? moveToSlot(groups.unchecked, dragKey, dropIndex)
        : groups.unchecked,
    [groups.unchecked, dragKey, dropIndex],
  );
  useReorderFlip(rowRefs, displayed, dragKey !== null);

  const addPlaceholder = (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-1 py-2 text-on-surface-variant hover:text-on-surface"
      onClick={() => {
        const ordered = [...rowsRef.current].sort(byPosition);
        const afterKey = addItemsToBottom ? (ordered.at(-1)?.key ?? null) : null;
        addRow(afterKey);
      }}
    >
      <Icon svg={addSvg} size={20} />
      <span className="text-sm">{t('listItemPlaceholder')}</span>
    </button>
  );

  return (
    <div ref={listRef} className="flex flex-col">
      {!readOnly && !addItemsToBottom && addPlaceholder}
      {displayed.map((row) => (
        <Row
          key={row.key}
          row={row}
          noteId={noteId}
          readOnly={readOnly}
          dragging={dragKey === row.key}
          indent={dragKey === row.key && dragIndent !== null ? dragIndent : row.indent}
          onDragStart={() => setDragKey(row.key)}
          inputRefs={inputRefs}
          rowRefs={rowRefs}
          selected={selectedKey === row.key}
          find={find}
          onText={changeText}
          onCheck={toggleCheck}
          onIndent={setIndent}
          onRemove={removeRow}
          onSplit={splitRow}
          onMergePrev={mergeIntoPrevious}
          onEdit={editSelected}
          onSelect={selectRow}
          onDeselect={deselect}
        />
      ))}
      {!readOnly && addItemsToBottom && addPlaceholder}

      {checkedCount > 0 && moveCheckedToBottom && (
        <div className="mt-1 border-(--outline-variant) border-t pt-1">
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 py-1.5 text-on-surface-variant text-sm hover:bg-(--surface-hover)"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            <Icon
              svg={chevronSvg}
              size={18}
              className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
            />
            {t('completedItems', { count: checkedCount })}
          </button>
          {/* A find hit down here beats the collapse: hiding the match the
              counter is pointing at would read as a broken search. */}
          {(!collapsed || groups.checked.some((r) => r.id !== null && find?.hits.has(r.id))) &&
            groups.checked.map((row) => (
              <Row
                key={row.key}
                row={row}
                noteId={noteId}
                readOnly={readOnly}
                dragging={false}
                indent={row.indent}
                onDragStart={() => {}}
                inputRefs={inputRefs}
                rowRefs={rowRefs}
                selected={selectedKey === row.key}
                find={find}
                onText={changeText}
                onCheck={toggleCheck}
                onIndent={setIndent}
                onRemove={removeRow}
                onSplit={splitRow}
                onMergePrev={mergeIntoPrevious}
                onEdit={editSelected}
                onSelect={selectRow}
                onDeselect={deselect}
              />
            ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  row: ChecklistRow;
  noteId: string;
  readOnly: boolean;
  dragging: boolean;
  /** `row.indent`, except mid-drag, where it previews the pending level. */
  indent: 0 | 1;
  onDragStart: () => void;
  inputRefs: React.RefObject<Map<string, HTMLTextAreaElement>>;
  rowRefs: React.RefObject<Map<string, HTMLDivElement>>;
  /** Holds the non-typing item focus (`n`/`p`). */
  selected: boolean;
  find?: ChecklistFind;
  onText: (key: string, text: string) => void;
  onCheck: (key: string, checked: boolean) => void;
  onIndent: (key: string, indent: 0 | 1) => void;
  onRemove: (key: string, focusPrev?: boolean) => void;
  onSplit: (key: string, caret: number) => void;
  onMergePrev: (key: string) => void;
  onEdit: (key: string) => void;
  onSelect: (key: string) => void;
  onDeselect: (key: string) => void;
}

function Row({
  row,
  noteId,
  readOnly,
  dragging,
  indent,
  onDragStart,
  inputRefs,
  rowRefs,
  selected,
  find,
  onText,
  onCheck,
  onIndent,
  onRemove,
  onSplit,
  onMergePrev,
  onEdit,
  onSelect,
  onDeselect,
}: RowProps) {
  const { t } = useTranslation('editor');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  // Text can change without anyone typing into the field — an undo, a
  // collaborator's edit — and the box has to grow or shrink to fit it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the text is the trigger, not something the effect reads
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [row.text]);

  useEffect(() => {
    const el = rootRef.current;
    const handle = handleRef.current;
    if (!el || readOnly || row.checked) return;
    const cleanups = [
      dropTargetForElements({
        element: el,
        getData: () => ({ rowKey: row.key, noteId }),
      }),
    ];
    if (handle) {
      cleanups.push(
        draggable({
          element: el,
          dragHandle: handle,
          getInitialData: () => {
            // The grab point for the indent gesture is the HANDLE, not the
            // pointer: `dragstart` can fire a few pixels into the movement (and
            // in automation, at the destination), while the handle's box is
            // exactly where the row still sits.
            const rect = handle.getBoundingClientRect();
            return { rowKey: row.key, noteId, originX: rect.left + rect.width / 2 };
          },
          onGenerateDragPreview: ({ nativeSetDragImage, location }) =>
            liftedRowPreview({ nativeSetDragImage, element: el, input: location.current.input }),
          onDragStart,
        }),
      );
    }
    return () => {
      for (const c of cleanups) c();
    };
  }, [row.key, row.checked, noteId, readOnly, onDragStart]);

  const hit = row.id !== null && find?.hits.has(row.id) === true;
  const currentHit = hit && find?.current === row.id;
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: the row is where the n/p selection parks — a focus destination, not a control (its checkbox, text and delete button are the controls) */
    <div
      ref={(el) => {
        rootRef.current = el;
        if (el) rowRefs.current.set(row.key, el);
        else rowRefs.current.delete(row.key);
      }}
      data-find-current={currentHit ? 'true' : undefined}
      data-indent={indent}
      data-selected={selected ? 'true' : undefined}
      // Reachable by script, never by Tab: Tab belongs to the fields inside.
      tabIndex={-1}
      onKeyDown={(e) => {
        // Only while the row itself holds the focus; once the textarea has it,
        // every key is text again.
        if (e.target !== e.currentTarget) return;
        // Enter goes back into the field; Escape is left alone, so it reaches
        // the modal and closes the note — one step further out, as expected.
        if (e.key === 'Enter') {
          e.preventDefault();
          onEdit(row.key);
        }
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) onDeselect(row.key);
      }}
      // The ring follows the selection, not the DOM focus — a row is only ever
      // focused because it was selected, and it must not look picked while the
      // caret is in the field inside it.
      className={`group/row flex items-start gap-1 border-transparent border-b py-0.5 outline-offset-1 outline-(--primary) motion-safe:transition-[margin-left] motion-safe:duration-100 ${
        selected ? 'outline-2' : ''
      } ${indent === 1 ? 'ml-7' : ''} ${dragging ? 'opacity-0' : ''} ${
        hit ? (currentHit ? 'find-field find-field-current' : 'find-field') : ''
      }`}
    >
      {!readOnly && !row.checked ? (
        <button
          ref={handleRef}
          type="button"
          aria-label={t('dragItem')}
          className="mt-1.5 cursor-grab text-on-surface-variant opacity-0 group-hover/row:opacity-60"
          tabIndex={-1}
        >
          <Icon svg={dragSvg} size={18} />
        </button>
      ) : (
        <span className="w-[18px]" />
      )}
      <input
        type="checkbox"
        checked={row.checked}
        disabled={readOnly}
        aria-label={row.text || t('listItemPlaceholder')}
        onChange={(e) => onCheck(row.key, e.target.checked)}
        className="mt-1.5 h-4 w-4 flex-none accent-(--on-surface-variant)"
      />
      <textarea
        ref={(el) => {
          textRef.current = el;
          if (el) inputRefs.current.set(row.key, el);
          else inputRefs.current.delete(row.key);
        }}
        value={row.text}
        readOnly={readOnly || row.checked}
        rows={1}
        aria-label={t('listItemPlaceholder')}
        className={`min-h-6 w-full resize-none bg-transparent px-1 py-0.5 text-[0.875rem] text-on-surface leading-5 outline-none ${
          row.checked ? 'text-on-surface-variant line-through' : ''
        } focus:border-(--outline) border-b border-transparent`}
        onChange={(e) => onText(row.key, e.target.value)}
        onKeyDown={(e) => {
          if (readOnly || row.checked) return;
          const el = e.currentTarget;
          if (e.key === 'Escape') {
            // Step out of the field onto the item — the note stays open, and
            // the next Escape (from the item) closes it as usual.
            e.preventDefault();
            e.stopPropagation();
            onSelect(row.key);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            onSplit(row.key, el.selectionStart ?? row.text.length);
          } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0) {
            e.preventDefault();
            if (row.text === '') onRemove(row.key, true);
            else onMergePrev(row.key);
          } else if (
            (e.key === ']' && (e.ctrlKey || e.metaKey)) ||
            (e.key === 'Tab' && !e.shiftKey)
          ) {
            e.preventDefault();
            onIndent(row.key, 1);
          } else if (
            (e.key === '[' && (e.ctrlKey || e.metaKey)) ||
            (e.key === 'Tab' && e.shiftKey)
          ) {
            e.preventDefault();
            onIndent(row.key, 0);
          }
        }}
      />
      {!readOnly && (
        <IconButton
          svg={closeSvg}
          label={t('deleteItem')}
          size={28}
          iconSize={16}
          className="mt-0.5 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          onClick={() => onRemove(row.key)}
        />
      )}
    </div>
  );
}
