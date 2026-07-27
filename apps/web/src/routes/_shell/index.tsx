import lightbulbSvg from '@material-symbols/svg-400/outlined/lightbulb.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { Composer } from '../../components/notes/Composer.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { selectMain } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/')({
  component: NotesView,
});

function NotesView() {
  const { t } = useTranslation('notes');
  const { data: notes, isSuccess } = useQuery({ ...notesQuery, select: selectMain });
  const { data: settings } = useQuery(settingsQuery);
  const viewMode = settings?.viewMode ?? 'grid';

  const pinned = notes?.pinned ?? [];
  const others = notes?.others ?? [];
  const isEmpty = isSuccess && pinned.length === 0 && others.length === 0;
  usePublishViewOrder(useMemo(() => [...pinned, ...others].map((n) => n.id), [pinned, others]));

  return (
    <div className="px-6 pb-16">
      <Composer />
      {isEmpty ? (
        <EmptyView svg={lightbulbSvg} text={t('emptyStateNotes')} />
      ) : (
        <div className="mx-auto flex max-w-full flex-col gap-4">
          {pinned.length > 0 && (
            <>
              <SectionHeader label={t('pinnedSection')} />
              <NotesGrid notes={pinned} viewMode={viewMode} dndSection="pinned" />
              {others.length > 0 && <SectionHeader label={t('othersSection')} />}
            </>
          )}
          <NotesGrid notes={others} viewMode={viewMode} dndSection="others" />
        </div>
      )}
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
