import searchSvg from '@material-symbols/svg-400/outlined/search.svg?raw';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { EmptyView } from '../../components/EmptyView.js';

const searchParams = z.object({
  q: z.string().default(''),
});

export const Route = createFileRoute('/_shell/search')({
  validateSearch: searchParams,
  component: SearchView,
});

function SearchView() {
  const { t } = useTranslation('shell');
  // Search UX lands in M4.
  return <EmptyView svg={searchSvg} text={t('searchPlaceholder')} />;
}
