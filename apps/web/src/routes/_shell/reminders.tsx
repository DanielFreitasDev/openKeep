import notificationsSvg from '@material-symbols/svg-400/outlined/notifications.svg?raw';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';

export const Route = createFileRoute('/_shell/reminders')({
  component: RemindersView,
});

function RemindersView() {
  const { t } = useTranslation('shell');
  // Reminders land in M6.
  return <EmptyView svg={notificationsSvg} text={t('navReminders')} />;
}
