import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Dialog } from '@base-ui/react/dialog';
import { Popover } from '@base-ui/react/popover';
import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import checkSvg from '@material-symbols/svg-700/outlined/check.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import deleteSvg from '@material-symbols/svg-700/outlined/delete.svg?raw';
import dragSvg from '@material-symbols/svg-700/outlined/drag_indicator.svg?raw';
import editSvg from '@material-symbols/svg-700/outlined/edit.svg?raw';
import subdirectorySvg from '@material-symbols/svg-700/outlined/subdirectory_arrow_right.svg?raw';
import type { FlatLabel, Label } from '@openkeep/shared';
import { flattenLabelTree, sortLabels } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';
import { ConfirmDialog } from '../notes/ConfirmDialog.js';
import { LabelDot, LabelStyleMenu } from './LabelStyleMenu.js';

const EMPTY_DIALOG_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/** Keep's "Edit labels" modal: create, rename inline, recolour, nest, reorder, delete. */
export function EditLabelsDialog() {
  const { t } = useTranslation('labels');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const { data: labels } = useQuery(labelsQuery);
  const m = useLabelMutations();
  const [newName, setNewName] = useState('');

  useKeyScope('dialog', EMPTY_DIALOG_BINDINGS, activeDialog === 'edit-labels');
  if (activeDialog !== 'edit-labels') return null;

  const createIfValid = () => {
    const name = newName.trim();
    if (name === '') return;
    m.create.mutate({ name });
    setNewName('');
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setActiveDialog(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[70vh] w-[min(92vw,360px)] flex-col rounded-lg bg-surface shadow-(--elevation-3)">
          <Dialog.Title className="px-4 pt-4 pb-2 font-medium text-base text-on-surface">
            {t('editLabelsTitle')}
          </Dialog.Title>

          <div className="flex items-center gap-1 px-2">
            <IconButton
              svg={newName ? closeSvg : addSvg}
              label={newName ? t('clearName') : t('createLabel')}
              size={36}
              iconSize={18}
              onClick={() => setNewName('')}
            />
            <input
              type="text"
              value={newName}
              maxLength={225}
              placeholder={t('createLabel')}
              aria-label={t('createLabel')}
              className="w-full border-transparent border-b bg-transparent py-1.5 font-medium text-on-surface text-sm outline-none focus:border-(--outline)"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createIfValid();
              }}
            />
            {newName.trim() !== '' && (
              <IconButton
                svg={checkSvg}
                label={t('createLabel')}
                size={36}
                iconSize={18}
                onClick={createIfValid}
              />
            )}
          </div>

          <LabelList labels={labels ?? []} />

          <div className="flex justify-end border-(--outline-variant) border-t px-3 py-2">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)">
              {t('common:done')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Where a drop would land relative to the row it is over. */
type DropZone = 'before' | 'after' | 'inside';

interface DropTarget {
  labelId: string;
  zone: DropZone;
}

/**
 * The reorderable tree. A row's height splits three ways: the top and bottom
 * quarters mean "between siblings here", and the middle half means "inside
 * this one" — one gesture that both reorders and nests, because in a tree
 * those are the same move.
 *
 * Only the dragged label is written (one PATCH carrying its parent and one
 * fractional position, DECISIONS #12).
 */
function LabelList({ labels }: { labels: Label[] }) {
  const m = useLabelMutations();
  const rows = useMemo(() => flattenLabelTree(labels), [labels]);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const moveRef = useRef(m.move);
  moveRef.current = m.move;

  useEffect(() => {
    const targetAt = (location: {
      current: {
        input: { clientY: number };
        dropTargets: { data: Record<string, unknown>; element: Element }[];
      };
    }): DropTarget | null => {
      // Innermost target first — rows are the only drop targets here anyway.
      const hit = location.current.dropTargets[0];
      const labelId = hit?.data.labelId;
      if (typeof labelId !== 'string' || !hit) return null;
      const rect = hit.element.getBoundingClientRect();
      const offset = (location.current.input.clientY - rect.top) / rect.height;
      if (offset < 0.25) return { labelId, zone: 'before' };
      if (offset > 0.75) return { labelId, zone: 'after' };
      return { labelId, zone: 'inside' };
    };

    return monitorForElements({
      canMonitor: ({ source }) => typeof source.data.labelId === 'string',
      onDragStart: ({ source }) => setDraggingId(source.data.labelId as string),
      onDrag: ({ location }) => setTarget(targetAt(location)),
      onDrop: ({ source, location }) => {
        const drop = targetAt(location);
        setDraggingId(null);
        setTarget(null);
        if (!drop) return;
        const id = source.data.labelId as string;
        const all = labelsRef.current;
        const onto = all.find((l) => l.id === drop.labelId);
        if (!onto || onto.id === id) return;

        if (drop.zone === 'inside') {
          moveRef.current(id, onto.id, Number.MAX_SAFE_INTEGER);
          return;
        }
        // `move` counts in the destination list WITHOUT the dragged row, so
        // the index is taken from the siblings minus it.
        const siblings = sortLabels(all.filter((l) => l.parentId === onto.parentId && l.id !== id));
        const at = siblings.findIndex((l) => l.id === onto.id);
        if (at === -1) return;
        moveRef.current(id, onto.parentId, drop.zone === 'before' ? at : at + 1);
      },
    });
  }, []);

  return (
    <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
      {rows.map((row) => (
        <LabelRow
          key={row.label.id}
          row={row}
          rows={rows}
          dragging={draggingId === row.label.id}
          zone={target?.labelId === row.label.id ? target.zone : null}
        />
      ))}
    </div>
  );
}

function LabelRow({
  row,
  rows,
  dragging,
  zone,
}: {
  row: FlatLabel<Label>;
  rows: FlatLabel<Label>[];
  dragging: boolean;
  zone: DropZone | null;
}) {
  const { label, depth, path } = row;
  const { t } = useTranslation('labels');
  const m = useLabelMutations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const siblings = rows.filter((r) => r.label.parentId === label.parentId);
  const siblingAt = siblings.findIndex((r) => r.label.id === label.id);
  /** Only a row with a sibling above it has somewhere to be filed into. */
  const nestInto = siblingAt > 0 ? siblings[siblingAt - 1]!.label : null;

  const rowRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return undefined;
      const cleanups = [
        draggable({ element: el, getInitialData: () => ({ labelId: label.id }) }),
        dropTargetForElements({ element: el, getData: () => ({ labelId: label.id }) }),
      ];
      return () => {
        for (const c of cleanups) c();
      };
    },
    [label.id],
  );

  const commit = () => {
    const trimmed = name.trim();
    if (trimmed !== '' && trimmed !== label.name) {
      m.rename.mutate({ id: label.id, name: trimmed });
    } else {
      setName(label.name);
    }
    setEditing(false);
  };

  /**
   * Keyboard parity for the drag, and the only accessible path to nesting:
   * ↑/↓ move a row among its siblings, → files it under the sibling above it,
   * ← lifts it out to sit after its parent. Same idiom as indenting a list.
   */
  const onHandleKey = (e: React.KeyboardEvent) => {
    const at = siblingAt;
    if (e.key === 'ArrowUp' && at > 0) {
      e.preventDefault();
      m.reorder(label.id, at - 1);
    } else if (e.key === 'ArrowDown' && at < siblings.length - 1) {
      e.preventDefault();
      m.reorder(label.id, at + 1);
    } else if (e.key === 'ArrowRight' && nestInto) {
      e.preventDefault();
      m.setParent(label.id, nestInto.id);
    } else if (e.key === 'ArrowLeft' && label.parentId) {
      e.preventDefault();
      const parent = rows.find((r) => r.label.id === label.parentId);
      const grandparentId = parent?.label.parentId ?? null;
      const uncles = rows.filter((r) => r.label.parentId === grandparentId);
      const parentAt = uncles.findIndex((r) => r.label.id === label.parentId);
      m.move(label.id, grandparentId, parentAt + 1);
    }
  };

  return (
    <div
      ref={rowRef}
      data-testid="label-row"
      data-label-path={path}
      data-depth={depth}
      className={`group/label flex items-center gap-1 rounded px-1 py-0.5 ${
        dragging ? 'opacity-40' : ''
      } ${zone === 'before' ? 'border-(--primary) border-t-2' : ''} ${
        zone === 'after' ? 'border-(--primary) border-b-2' : ''
      } ${zone === 'inside' ? 'bg-accent-container ring-1 ring-(--primary) ring-inset' : ''}`}
      // Nesting is spatial, so the row itself carries the indent. The 0.75rem
      // step is the drag handle's width — a child starts where its parent's
      // mark does.
      style={{ marginLeft: `${depth * 0.75}rem` }}
    >
      {/* Drag by the handle only: the row also holds a text field, and a
          native drag started from it would swallow the caret. */}
      <button
        type="button"
        aria-label={t('reorderLabel', { name: path })}
        className="flex h-9 w-5 flex-none cursor-grab items-center justify-center text-on-surface-variant opacity-0 focus-visible:opacity-100 group-hover/label:opacity-100"
        onKeyDown={onHandleKey}
      >
        <Icon svg={dragSvg} size={16} />
      </button>

      <LabelStyleMenu label={label}>
        <Popover.Trigger
          aria-label={t('labelStyle', { name: label.name })}
          data-tooltip={t('labelStyle', { name: label.name })}
          className="flex h-9 w-7 flex-none items-center justify-center rounded hover:bg-(--surface-hover)"
        >
          <LabelDot label={label} />
        </Popover.Trigger>
      </LabelStyleMenu>

      <input
        type="text"
        value={name}
        maxLength={225}
        aria-label={t('renameLabel')}
        readOnly={!editing}
        className={`w-full bg-transparent py-1.5 text-on-surface text-sm outline-none ${
          editing ? 'border-(--outline) border-b' : 'border-transparent border-b'
        }`}
        onChange={(e) => setName(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setName(label.name);
            setEditing(false);
          }
        }}
      />
      {/* Nesting without a mouse and without arrow keys: file this label under
          the sibling above it. Absent when there is no sibling above. */}
      {nestInto && (
        <IconButton
          svg={subdirectorySvg}
          label={t('nestLabel', { name: label.name, parent: nestInto.name })}
          size={36}
          iconSize={16}
          className="opacity-0 group-hover/label:opacity-100"
          onClick={() => m.setParent(label.id, nestInto.id)}
        />
      )}
      <IconButton
        svg={editing ? checkSvg : editSvg}
        label={editing ? t('common:save') : t('renameLabel')}
        size={36}
        iconSize={16}
        className={editing ? '' : 'opacity-0 group-hover/label:opacity-100'}
        onClick={(e) => {
          e.preventDefault();
          if (editing) commit();
          else setEditing(true);
        }}
      />
      <IconButton
        svg={deleteSvg}
        label={t('deleteLabel')}
        size={36}
        iconSize={16}
        className="opacity-0 group-hover/label:opacity-100"
        // A leaf goes on the click, like it always did. A folder takes its
        // sub-labels with it (the server cascades), and that is not something
        // to discover after the fact.
        onClick={() => (row.hasChildren ? setConfirmingDelete(true) : m.remove.mutate(label.id))}
      />
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        text={t('deleteLabelTreeConfirm', { name: label.name })}
        confirmLabel={t('common:delete')}
        onConfirm={() => m.remove.mutate(label.id)}
      />
    </div>
  );
}
