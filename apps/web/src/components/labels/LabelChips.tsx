import closeSvg from '@material-symbols/svg-400/outlined/close.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { Icon } from '../Icon.js';

/**
 * Label chips. On cards: up to `max`, then a "+N" chip; click navigates to the
 * label view. Where `onRemove` is given (editor, composer) each chip gets an ✕
 * on hover and all chips are shown.
 */
export function LabelChips({
  labelIds,
  max = 3,
  onRemove,
}: {
  labelIds: string[];
  max?: number;
  onRemove?: (labelId: string) => void;
}) {
  const { t } = useTranslation('labels');
  const { data: labels } = useQuery(labelsQuery);
  const navigate = useNavigate();

  if (labelIds.length === 0 || !labels) return null;
  const mine = labels.filter((l) => labelIds.includes(l.id));
  const shown = onRemove ? mine : mine.slice(0, max);
  const overflow = mine.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {shown.map((label) => (
        <span
          key={label.id}
          className="group/chip relative inline-flex h-6 max-w-40 items-center rounded-full bg-(--surface-hover) px-2.5 font-medium text-[0.6875rem] text-on-surface-variant"
        >
          <button
            type="button"
            className="truncate"
            title={label.name}
            onClick={(e) => {
              e.stopPropagation();
              void navigate({ to: '/label/$labelName', params: { labelName: label.name } });
            }}
          >
            {label.name}
          </button>
          {onRemove && (
            <button
              type="button"
              aria-label={t('removeLabel', { name: label.name })}
              className="ml-1 hidden rounded-full group-hover/chip:inline-flex"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(label.id);
              }}
            >
              <Icon svg={closeSvg} size={12} />
            </button>
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="inline-flex h-6 items-center rounded-full bg-(--surface-hover) px-2.5 font-medium text-[0.6875rem] text-on-surface-variant">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Chips for a persisted note; `removable` unassigns the label. */
export function NoteLabelChips({
  note,
  max,
  removable = false,
}: {
  note: FullNote;
  max?: number;
  removable?: boolean;
}) {
  const m = useLabelMutations();
  return (
    <LabelChips
      labelIds={note.labelIds}
      max={max}
      onRemove={
        removable
          ? (labelId) => m.setNoteLabel.mutate({ noteId: note.id, labelId, on: false })
          : undefined
      }
    />
  );
}
