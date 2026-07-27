import labelSvg from '@material-symbols/svg-400/outlined/label.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { labelsQuery } from '../../lib/labels-api.js';
import { selectByLabel } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/label/$labelName')({
  component: LabelView,
});

function LabelView() {
  const { t } = useTranslation('labels');
  const { labelName } = Route.useParams();
  const { data: labels } = useQuery(labelsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const label = labels?.find((l) => l.name.toLowerCase() === labelName.toLowerCase());

  const { data: sections } = useQuery({
    ...notesQuery,
    select: (notes) => (label ? selectByLabel(notes, label.id) : { pinned: [], others: [] }),
  });

  const pinned = sections?.pinned ?? [];
  const others = sections?.others ?? [];
  const viewMode = settings?.viewMode ?? 'grid';
  usePublishViewOrder(useMemo(() => [...pinned, ...others].map((n) => n.id), [pinned, others]));

  if (pinned.length === 0 && others.length === 0) {
    return <EmptyView svg={labelSvg} text={t('emptyLabelView')} />;
  }

  return (
    <div className="px-6 py-8">
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
