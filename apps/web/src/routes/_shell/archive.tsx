import archiveSvg from '@material-symbols/svg-400/outlined/archive.svg?raw';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';

export const Route = createFileRoute('/_shell/archive')({
  component: ArchiveView,
});

function ArchiveView() {
  const { t } = useTranslation('shell');
  // Archive grid lands in M2.
  return <EmptyView svg={archiveSvg} text={t('navArchive')} />;
}
