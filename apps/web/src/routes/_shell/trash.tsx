import deleteSvg from '@material-symbols/svg-400/outlined/delete.svg?raw';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';

export const Route = createFileRoute('/_shell/trash')({
  component: TrashView,
});

function TrashView() {
  const { t } = useTranslation('shell');
  // Trash view lands in M2.
  return <EmptyView svg={deleteSvg} text={t('navTrash')} />;
}
