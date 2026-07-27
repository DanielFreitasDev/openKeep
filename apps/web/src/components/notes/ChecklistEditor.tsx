import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import addSvg from '@material-symbols/svg-400/outlined/add.svg?raw';
import closeSvg from '@material-symbols/svg-400/outlined/close.svg?raw';
import dragSvg from '@material-symbols/svg-400/outlined/drag_indicator.svg?raw';
import chevronSvg from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg?raw';
import type { FullNote, NoteItem } from '@openkeep/shared';
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
import {
  createItemApi,
  deleteCheckedApi,
  deleteItemApi,
  patchItemApi,
  uncheckAllApi,
  updateCachedItems,
} from '../../lib/items-api.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';
import type { ChecklistRow } from './checklist-logic.js';
import {
  applyCheck,
  byPosition,
  canIndent,
  displayGroups,
  positionAfterRow,
  positionAtIndex,
  splitText,
} from './checklist-logic.js';

export interface ChecklistHandle {
  uncheckAll: () => void;
  deleteChecked: () => void;
  hasChecked: () => boolean;
}

interface ChecklistEditorProps {
  note: FullNote;
  readOnly: boolean;
  moveCheckedToBottom: boolean;
  addItemsToBottom: boolean;
  handleRef?: React.Ref<ChecklistHandle>;
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
}: ChecklistEditorProps) {
  const { t } = useTranslation('editor');
  const queryClient = useQueryClient();
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
  const creations = useRef(new Map<string, Promise<string | null>>());
  const textTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusRequest = useRef<{ key: string; caret: number } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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
      withServerId(key, (id) => {
        void patchItemApi(noteId, id, patch).then((result) => {
          cacheUpsert(result.item);
          for (const c of result.cascaded) cacheUpsert(c);
        });
      });
    },
    [withServerId, noteId, cacheUpsert],
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

  // ---------------------------------------------------------------- ops

  const addRow = useCallback(
    (afterKey: string | null, seedText = '', indent: 0 | 1 = 0, caret = 0) => {
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
          setRows((prev) => prev.filter((r) => r.key !== key));
          return null;
        });
      creations.current.set(key, creation);
      return key;
    },
    [noteId, cacheUpsert],
  );

  const changeText = useCallback(
    (key: string, text: string) => {
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, text } : r)));
      scheduleTextSync(key, text);
    },
    [scheduleTextSync],
  );

  const toggleCheck = useCallback(
    (key: string, checked: boolean) => {
      setRows((prev) => applyCheck(prev, key, checked).rows);
      patchServer(key, { checked });
    },
    [patchServer],
  );

  const setIndent = useCallback(
    (key: string, indent: 0 | 1) => {
      if (indent === 1 && !canIndent(rowsRef.current, key)) return;
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, indent } : r)));
      patchServer(key, { indent });
    },
    [patchServer],
  );

  const removeRow = useCallback(
    (key: string, focusPrev = false) => {
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
        void deleteItemApi(noteId, id).then(() => cacheRemove(id));
      });
    },
    [withServerId, noteId, cacheRemove],
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

  useImperativeHandle(
    handleRef,
    () => ({
      hasChecked: () => rowsRef.current.some((r) => r.checked),
      uncheckAll: () => {
        setRows((prev) => prev.map((r) => ({ ...r, checked: false })));
        void uncheckAllApi(noteId).then((res) =>
          updateCachedItems(queryClient, noteId, () => res.items),
        );
      },
      deleteChecked: () => {
        setRows((prev) => prev.filter((r) => !r.checked));
        void deleteCheckedApi(noteId).then((res) =>
          updateCachedItems(queryClient, noteId, () => res.items),
        );
      },
    }),
    [noteId, queryClient],
  );

  // ---------------------------------------------------------------- dnd

  const [dragKey, setDragKey] = useState<string | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el || readOnly) return;
    return monitorForElements({
      canMonitor: ({ source }) => source.data.noteId === noteId,
      onDrop: ({ source, location }) => {
        setDragKey(null);
        const key = source.data.rowKey as string;
        const target = location.current.dropTargets[0];
        if (!target) return;
        const overKey = target.data.rowKey as string;
        if (overKey === key) return;
        const ordered = [...rowsRef.current].sort(byPosition).filter((r) => !r.checked);
        const overIdx = ordered.findIndex((r) => r.key === overKey);
        if (overIdx === -1) return;
        const rect = (target.element as HTMLElement).getBoundingClientRect();
        const clientY = location.current.input.clientY ?? rect.top + rect.height / 2;
        const before = clientY < rect.top + rect.height / 2;
        const toIndex = before ? overIdx : overIdx + 1;
        const position = positionAtIndex(
          rowsRef.current.filter((r) => !r.checked),
          key,
          toIndex,
        );
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, position } : r)));
        patchServer(key, { position });
      },
    });
  }, [noteId, readOnly, patchServer]);

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

  const groups = useMemo(
    () => displayGroups(rows, moveCheckedToBottom),
    [rows, moveCheckedToBottom],
  );
  const checkedCount = rows.filter((r) => r.checked).length;

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
      {groups.unchecked.map((row) => (
        <Row
          key={row.key}
          row={row}
          noteId={noteId}
          readOnly={readOnly}
          dragging={dragKey === row.key}
          onDragStart={() => setDragKey(row.key)}
          inputRefs={inputRefs}
          onText={changeText}
          onCheck={toggleCheck}
          onIndent={setIndent}
          onRemove={removeRow}
          onSplit={splitRow}
          onMergePrev={mergeIntoPrevious}
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
          {!collapsed &&
            groups.checked.map((row) => (
              <Row
                key={row.key}
                row={row}
                noteId={noteId}
                readOnly={readOnly}
                dragging={false}
                onDragStart={() => {}}
                inputRefs={inputRefs}
                onText={changeText}
                onCheck={toggleCheck}
                onIndent={setIndent}
                onRemove={removeRow}
                onSplit={splitRow}
                onMergePrev={mergeIntoPrevious}
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
  onDragStart: () => void;
  inputRefs: React.RefObject<Map<string, HTMLTextAreaElement>>;
  onText: (key: string, text: string) => void;
  onCheck: (key: string, checked: boolean) => void;
  onIndent: (key: string, indent: 0 | 1) => void;
  onRemove: (key: string, focusPrev?: boolean) => void;
  onSplit: (key: string, caret: number) => void;
  onMergePrev: (key: string) => void;
}

function Row({
  row,
  noteId,
  readOnly,
  dragging,
  onDragStart,
  inputRefs,
  onText,
  onCheck,
  onIndent,
  onRemove,
  onSplit,
  onMergePrev,
}: RowProps) {
  const { t } = useTranslation('editor');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);

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
          getInitialData: () => ({ rowKey: row.key, noteId }),
          onDragStart,
        }),
      );
    }
    return () => {
      for (const c of cleanups) c();
    };
  }, [row.key, row.checked, noteId, readOnly, onDragStart]);

  return (
    <div
      ref={rootRef}
      className={`group/row flex items-start gap-1 border-transparent border-b py-0.5 ${
        row.indent === 1 ? 'ml-7' : ''
      } ${dragging ? 'opacity-40' : ''}`}
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
          if (el) {
            inputRefs.current.set(row.key, el);
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          } else {
            inputRefs.current.delete(row.key);
          }
        }}
        value={row.text}
        readOnly={readOnly || row.checked}
        rows={1}
        aria-label={t('listItemPlaceholder')}
        className={`min-h-6 w-full resize-none bg-transparent px-1 py-0.5 text-[0.875rem] text-on-surface leading-5 outline-none ${
          row.checked ? 'text-on-surface-variant line-through' : ''
        } focus:border-(--outline) border-b border-transparent`}
        onChange={(e) => {
          onText(row.key, e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (readOnly || row.checked) return;
          const el = e.currentTarget;
          if (e.key === 'Enter') {
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
