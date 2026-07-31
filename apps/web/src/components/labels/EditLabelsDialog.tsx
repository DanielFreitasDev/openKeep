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
import type { Label } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';
import { LabelDot, LabelStyleMenu } from './LabelStyleMenu.js';

const EMPTY_DIALOG_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/** Keep's "Edit labels" modal: create, rename inline, recolour, reorder, delete. */
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
    m.create.mutate(name);
    setNewName('');
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setActiveDialog(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[70vh] w-[min(92vw,320px)] flex-col rounded-lg bg-surface shadow-(--elevation-3)">
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

/**
 * The reorderable list. Drag decides the drop slot from the pointer against the
 * hovered row's midpoint — above it means "before", below means "after" — and
 * only the moved label is written (one fractional position, DECISIONS #12).
 */
function LabelList({ labels }: { labels: Label[] }) {
  const m = useLabelMutations();
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** Gap the drop would use, as an index into the full list. */
  const [gap, setGap] = useState<number | null>(null);
  const reorderRef = useRef(m.reorder);
  reorderRef.current = m.reorder;

  useEffect(() => {
    /**
     * The gap the pointer is over, as an index into the full list, or null
     * when it is over no row. The hovered row's midpoint decides: above it the
     * drop lands before that row, below it after.
     */
    const gapAt = (location: {
      current: {
        input: { clientY: number };
        dropTargets: { data: Record<string, unknown>; element: Element }[];
      };
    }) => {
      // Innermost target first — rows are the only drop targets here anyway.
      const target = location.current.dropTargets[0];
      const index = target?.data.labelIndex;
      if (typeof index !== 'number' || !target) return null;
      const rect = target.element.getBoundingClientRect();
      return location.current.input.clientY < rect.top + rect.height / 2 ? index : index + 1;
    };

    return monitorForElements({
      canMonitor: ({ source }) => typeof source.data.labelId === 'string',
      onDragStart: ({ source }) => setDraggingId(source.data.labelId as string),
      onDrag: ({ location }) => setGap(gapAt(location)),
      onDrop: ({ source, location }) => {
        const raw = gapAt(location);
        setDraggingId(null);
        setGap(null);
        if (raw === null) return;
        const id = source.data.labelId as string;
        const from = labelsRef.current.findIndex((l) => l.id === id);
        if (from === -1) return;
        // `reorder` counts in the list WITHOUT the dragged row.
        reorderRef.current(id, raw > from ? raw - 1 : raw);
      },
    });
  }, []);

  return (
    <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
      {labels.map((label, index) => (
        <LabelRow
          key={label.id}
          label={label}
          index={index}
          count={labels.length}
          dragging={draggingId === label.id}
          gapBefore={gap === index}
          gapAfter={gap === index + 1 && index === labels.length - 1}
        />
      ))}
    </div>
  );
}

function LabelRow({
  label,
  index,
  count,
  dragging,
  gapBefore,
  gapAfter,
}: {
  label: Label;
  index: number;
  count: number;
  dragging: boolean;
  gapBefore: boolean;
  gapAfter: boolean;
}) {
  const { t } = useTranslation('labels');
  const m = useLabelMutations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);

  const rowRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return undefined;
      const cleanups = [
        draggable({ element: el, getInitialData: () => ({ labelId: label.id }) }),
        dropTargetForElements({ element: el, getData: () => ({ labelIndex: index }) }),
      ];
      return () => {
        for (const c of cleanups) c();
      };
    },
    [label.id, index],
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

  return (
    <div
      ref={rowRef}
      data-testid="label-row"
      className={`group/label flex items-center gap-1 rounded px-1 py-0.5 ${
        dragging ? 'opacity-40' : ''
      } ${gapBefore ? 'border-(--primary) border-t-2' : ''} ${
        gapAfter ? 'border-(--primary) border-b-2' : ''
      }`}
    >
      {/* Drag by the handle only: the row also holds a text field, and a
          native drag started from it would swallow the caret. */}
      <button
        type="button"
        aria-label={t('reorderLabel', { name: label.name })}
        className="flex h-9 w-5 flex-none cursor-grab items-center justify-center text-on-surface-variant opacity-0 focus-visible:opacity-100 group-hover/label:opacity-100"
        onKeyDown={(e) => {
          // Keyboard parity for the drag: arrows move the row one slot.
          if (e.key === 'ArrowUp' && index > 0) {
            e.preventDefault();
            m.reorder(label.id, index - 1);
          } else if (e.key === 'ArrowDown' && index < count - 1) {
            e.preventDefault();
            m.reorder(label.id, index + 1);
          }
        }}
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
        onClick={() => m.remove.mutate(label.id)}
      />
    </div>
  );
}
