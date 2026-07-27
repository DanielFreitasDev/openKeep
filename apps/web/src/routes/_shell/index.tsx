import lightbulbSvg from '@material-symbols/svg-400/outlined/lightbulb.svg?raw';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';

export const Route = createFileRoute('/_shell/')({
  component: NotesView,
});

function NotesView() {
  const { t } = useTranslation('shell');
  // Composer + masonry grid land in M2.
  return <EmptyView svg={lightbulbSvg} text={t('emptyView')} />;
}
