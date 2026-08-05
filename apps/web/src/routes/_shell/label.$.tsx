import labelSvg from '@material-symbols/svg-700/outlined/label.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { findLabelByPath, labelSubtreeIds } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { MobileFab } from '../../components/shell/MobileFab.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { labelsQuery } from '../../lib/labels-api.js';
import { selectByLabels } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

/**
 * A splat, not a `$labelName`: the path IS the identifier now, and it carries
 * as many segments as the label has ancestors (`/label/Work/Clients/ACME`).
 */
export const Route = createFileRoute('/_shell/label/$')({
  component: LabelView,
});

/** Shared so the "no such label" result keeps a stable identity. */
const EMPTY_SECTIONS = { pinned: [], others: [] };
const NO_IDS: string[] = [];

function LabelView() {
  const { t } = useTranslation('labels');
  const { _splat } = Route.useParams();
  const { data: labels } = useQuery(labelsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const label = labels && findLabelByPath(labels, _splat ?? '');

  /**
   * A folder answers for its contents: the view filters by the label AND
   * everything nested under it, which is the whole reason to nest.
   */
  const labelIds = useMemo(
    () => (labels && label ? labelSubtreeIds(labels, label.id) : NO_IDS),
    [labels, label],
  );

  // Stable identity: an inline select re-filters the whole corpus on every
  // render instead of only when the label changes.
  const noteSort = settings?.noteSort ?? 'manual';
  const select = useCallback(
    (notes: FullNote[]) =>
      labelIds.length > 0 ? selectByLabels(notes, labelIds, noteSort) : EMPTY_SECTIONS,
    [labelIds, noteSort],
  );
  const { data: sections } = useQuery({ ...notesQuery, select });

  const pinned = sections?.pinned ?? [];
  const others = sections?.others ?? [];
  const viewMode = settings?.viewMode ?? 'grid';
  usePublishViewOrder(useMemo(() => [...pinned, ...others].map((n) => n.id), [pinned, others]));

  if (pinned.length === 0 && others.length === 0) {
    return (
      <>
        <EmptyView svg={labelSvg} text={t('emptyLabelView')} />
        <MobileFab labelId={label?.id} />
      </>
    );
  }

  return (
    <div className="px-3 pt-4 pb-28 md:px-6 md:py-8">
      <MobileFab labelId={label?.id} />
      <div className="mx-auto flex max-w-full flex-col gap-4">
        {pinned.length > 0 && (
          <>
            <SectionHeader label={t('notes:pinnedSection')} />
            <NotesGrid notes={pinned} viewMode={viewMode} />
            {others.length > 0 && <SectionHeader label={t('notes:othersSection')} />}
          </>
        )}
        <NotesGrid notes={others} viewMode={viewMode} />
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="mx-auto w-full max-w-full px-1 font-medium text-[0.6875rem] text-on-surface-variant uppercase tracking-wider">
      {label}
    </h2>
  );
}
