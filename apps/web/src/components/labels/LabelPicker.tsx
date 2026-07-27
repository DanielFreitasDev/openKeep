import addSvg from '@material-symbols/svg-400/outlined/add.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { normalizeForSearch } from '../../lib/note-selectors.js';
import { Icon } from '../Icon.js';

/**
 * Keep's "Label note" panel: filter/create input + checkbox list.
 * Rendered inside a Popover/Menu popup.
 */
export function LabelPicker({
  note,
  initialFilter = '',
}: {
  note: FullNote;
  initialFilter?: string;
}) {
  const { t } = useTranslation('labels');
  const { data: labels } = useQuery(labelsQuery);
  const m = useLabelMutations();
  const [filter, setFilter] = useState(initialFilter);

  const nq = normalizeForSearch(filter.trim());
  const visible = (labels ?? []).filter((l) => normalizeForSearch(l.name).includes(nq));
  const exactExists = (labels ?? []).some((l) => normalizeForSearch(l.name) === nq);

  const createAndAssign = async () => {
    const name = filter.trim();
    if (!name) return;
    const label = await m.create.mutateAsync(name).catch(() => null);
    if (label) m.setNoteLabel.mutate({ noteId: note.id, labelId: label.id, on: true });
    setFilter('');
  };

  return (
    <div className="flex w-56 flex-col py-2">
      <div className="px-3 pb-1 font-medium text-on-surface text-sm">{t('labelNote')}</div>
      <input
        type="text"
        value={filter}
        placeholder={t('enterLabelName')}
        aria-label={t('enterLabelName')}
        maxLength={225}
        // biome-ignore lint/a11y/noAutofocus: Keep focuses the filter on open (incl. `#` quick-label)
        autoFocus
        className="mx-3 mb-1 border-(--outline-variant) border-b bg-transparent py-1 text-on-surface text-sm outline-none focus:border-(--primary)"
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filter.trim() && !exactExists) void createAndAssign();
        }}
      />
      <div className="max-h-64 overflow-y-auto">
        {visible.map((label) => {
          const checked = note.labelIds.includes(label.id);
          return (
            <label
              key={label.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-on-surface text-sm hover:bg-(--surface-hover)"
            >
              {/* Uncontrolled: must flip in the click's frame; cache sync follows. */}
              <input
                type="checkbox"
                defaultChecked={checked}
                className="h-4 w-4 accent-(--on-surface-variant)"
                onChange={(e) =>
                  m.setNoteLabel.mutate({
                    noteId: note.id,
                    labelId: label.id,
                    on: e.target.checked,
                  })
                }
              />
              <span className="truncate">{label.name}</span>
            </label>
          );
        })}
      </div>
      {filter.trim() !== '' && !exactExists && (
        <button
          type="button"
          className="flex items-center gap-2 border-(--outline-variant) border-t px-3 py-2 text-on-surface text-sm hover:bg-(--surface-hover)"
          onClick={() => void createAndAssign()}
        >
          <Icon svg={addSvg} size={16} />
          <span className="truncate">{t('createNamed', { name: filter.trim() })}</span>
        </button>
      )}
    </div>
  );
}
