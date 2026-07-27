import { Dialog } from '@base-ui/react/dialog';
import addSvg from '@material-symbols/svg-400/outlined/add.svg?raw';
import checkSvg from '@material-symbols/svg-400/outlined/check.svg?raw';
import closeSvg from '@material-symbols/svg-400/outlined/close.svg?raw';
import deleteSvg from '@material-symbols/svg-400/outlined/delete.svg?raw';
import editSvg from '@material-symbols/svg-400/outlined/edit.svg?raw';
import labelSvg from '@material-symbols/svg-400/outlined/label.svg?raw';
import type { Label } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { useUiStore } from '../../stores/ui.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';

const EMPTY_DIALOG_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/** Keep's "Edit labels" modal: create, rename inline, delete. */
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
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[70vh] w-[min(92vw,300px)] flex-col rounded-lg bg-surface shadow-(--elevation-3)">
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

          <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
            {labels?.map((label) => (
              <LabelRow key={label.id} label={label} />
            ))}
          </div>

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

function LabelRow({ label }: { label: Label }) {
  const { t } = useTranslation('labels');
  const m = useLabelMutations();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);

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
    <div className="group/label flex items-center gap-1 rounded px-1 py-0.5">
      <span className="relative flex h-9 w-9 flex-none items-center justify-center text-on-surface-variant">
        <span className={editing ? 'hidden' : 'group-hover/label:hidden'}>
          <Icon svg={labelSvg} size={18} />
        </span>
        <span className={editing ? '' : 'hidden group-hover/label:inline-flex'}>
          <IconButton
            svg={deleteSvg}
            label={t('deleteLabel')}
            size={36}
            iconSize={18}
            onClick={() => m.remove.mutate(label.id)}
          />
        </span>
      </span>
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
    </div>
  );
}
