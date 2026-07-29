import notificationsSvg from '@material-symbols/svg-500/outlined/notifications.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { selectReminders } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/reminders')({
  component: RemindersView,
});

function RemindersView() {
  const { t } = useTranslation('reminders');
  const { data: withReminders, isSuccess } = useQuery({
    ...notesQuery,
    select: selectReminders,
  });
  const { data: settings } = useQuery(settingsQuery);
  usePublishViewOrder(useMemo(() => (withReminders ?? []).map((n) => n.id), [withReminders]));

  if (isSuccess && (withReminders?.length ?? 0) === 0) {
    return <EmptyView svg={notificationsSvg} text={t('emptyState')} />;
  }
  return (
    <div className="px-6 py-8">
      <NotesGrid notes={withReminders ?? []} viewMode={settings?.viewMode ?? 'grid'} />
    </div>
  );
}
