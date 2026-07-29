import archiveSvg from '@material-symbols/svg-500/outlined/archive.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { selectArchived } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/archive')({
  component: ArchiveView,
});

function ArchiveView() {
  const { t } = useTranslation('notes');
  const { data: archived, isSuccess } = useQuery({ ...notesQuery, select: selectArchived });
  const { data: settings } = useQuery(settingsQuery);
  usePublishViewOrder(useMemo(() => (archived ?? []).map((n) => n.id), [archived]));

  if (isSuccess && archived.length === 0) {
    return <EmptyView svg={archiveSvg} text={t('emptyStateArchive')} />;
  }
  return (
    <div className="px-6 py-8">
      <NotesGrid notes={archived ?? []} viewMode={settings?.viewMode ?? 'grid'} />
    </div>
  );
}
