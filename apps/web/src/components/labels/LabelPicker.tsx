import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import type { FullNote, Label } from '@openkeep/shared';
import { flattenLabelTree, labelPath, splitLabelPath } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { normalizeForSearch, selectBulkLabels } from '../../lib/note-selectors.js';
import { Icon } from '../Icon.js';

/**
 * Keep's "Label note" panel: filter/create input + checkbox list.
 * Rendered inside a Popover/Menu popup. Controlled, so the composer can
 * collect labels before the note exists.
 */
export function LabelPicker({
  selectedIds,
  mixedIds = [],
  onToggle,
  initialFilter = '',
  title,
}: {
  selectedIds: string[];
  /** Labels only some of the notes carry — rendered indeterminate (bulk). */
  mixedIds?: string[];
  onToggle: (labelId: string, on: boolean) => void;
  initialFilter?: string;
  title?: string;
}) {
  const { t } = useTranslation('labels');
  const { data: labels } = useQuery(labelsQuery);
  const m = useLabelMutations();
  const [filter, setFilter] = useState(initialFilter);

  const nq = normalizeForSearch(filter.trim());
  /**
   * Rows are the flattened tree, so a sub-label sits under its parent and
   * indents. The filter matches the whole path, which is what makes typing
   * "work" surface everything filed under Work.
   */
  const rows = flattenLabelTree(labels ?? []).filter((r) =>
    normalizeForSearch(r.path).includes(nq),
  );
  const exactExists = (labels ?? []).some(
    (l) =>
      normalizeForSearch(l.name) === nq || normalizeForSearch(labelPath(labels ?? [], l.id)) === nq,
  );

  /**
   * Typing a path creates the chain: "Work/Ideas" makes Ideas under Work,
   * creating Work first when it is missing. Anything else would leave the
   * separator meaning one thing in the URL and another in this box.
   */
  const createAndAssign = async () => {
    const segments = splitLabelPath(filter);
    if (segments.length === 0) return;
    let parentId: string | null = null;
    let created: Label | null = null;
    for (const segment of segments) {
      const existing = (labels ?? []).find(
        (l) => l.parentId === parentId && l.name.toLowerCase() === segment.toLowerCase(),
      );
      if (existing) {
        parentId = existing.id;
        created = existing;
        continue;
      }
      created = await m.create.mutateAsync({ name: segment, parentId }).catch(() => null);
      if (!created) return;
      parentId = created.id;
    }
    if (created) onToggle(created.id, true);
    setFilter('');
  };

  return (
    <div className="flex w-56 flex-col py-2">
      <div className="px-3 pb-1 font-medium text-on-surface text-sm">{title ?? t('labelNote')}</div>
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
        {rows.map(({ label, depth, path }) => {
          const checked = selectedIds.includes(label.id);
          const mixed = mixedIds.includes(label.id);
          return (
            <label
              key={label.id}
              title={path}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-on-surface text-sm hover:bg-(--surface-hover)"
              style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            >
              {/* Uncontrolled: must flip in the click's frame; cache sync follows.
                  `indeterminate` has no attribute — it is DOM-only, so the ref
                  (re-run on every render) is the only way to keep it in sync.
                  Clicking one lands on checked=true: mixed → applies to all. */}
              <input
                type="checkbox"
                defaultChecked={checked}
                ref={(el) => {
                  if (el) el.indeterminate = mixed;
                }}
                className="h-4 w-4 accent-(--on-surface-variant)"
                onChange={(e) => onToggle(label.id, e.target.checked)}
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

/**
 * The picker wired to a multi-selection: tri-state boxes, and a toggle fans out
 * to the notes it actually changes (a mixed label lands on "apply to all").
 */
export function BulkLabelPicker({ notes }: { notes: FullNote[] }) {
  const { t } = useTranslation('labels');
  const m = useLabelMutations();
  const { checked, mixed } = selectBulkLabels(notes);
  return (
    <LabelPicker
      title={t('labelNotes')}
      selectedIds={checked}
      mixedIds={mixed}
      onToggle={(labelId, on) => {
        for (const note of notes) {
          if (note.labelIds.includes(labelId) !== on)
            m.setNoteLabel.mutate({ noteId: note.id, labelId, on });
        }
      }}
    />
  );
}

/** The picker wired to a persisted note's label assignments. */
export function NoteLabelPicker({
  note,
  initialFilter,
}: {
  note: FullNote;
  initialFilter?: string;
}) {
  const m = useLabelMutations();
  return (
    <LabelPicker
      selectedIds={note.labelIds}
      onToggle={(labelId, on) => m.setNoteLabel.mutate({ noteId: note.id, labelId, on })}
      initialFilter={initialFilter}
    />
  );
}
