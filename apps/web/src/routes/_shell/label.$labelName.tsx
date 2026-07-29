import labelSvg from '@material-symbols/svg-700/outlined/label.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { MobileFab } from '../../components/shell/MobileFab.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { labelsQuery } from '../../lib/labels-api.js';
import { selectByLabel } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/label/$labelName')({
  component: LabelView,
});

/** Shared so the "no such label" result keeps a stable identity. */
const EMPTY_SECTIONS = { pinned: [], others: [] };

function LabelView() {
  const { t } = useTranslation('labels');
  const { labelName } = Route.useParams();
  const { data: labels } = useQuery(labelsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const label = labels?.find((l) => l.name.toLowerCase() === labelName.toLowerCase());

  // Stable identity: an inline select re-filters the whole corpus on every
  // render instead of only when the label changes.
  const labelId = label?.id;
  const select = useCallback(
    (notes: FullNote[]) => (labelId ? selectByLabel(notes, labelId) : EMPTY_SECTIONS),
    [labelId],
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
        <MobileFab labelId={labelId} />
      </>
    );
  }

  return (
    <div className="px-3 pt-4 pb-28 md:px-6 md:py-8">
      <MobileFab labelId={labelId} />
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
