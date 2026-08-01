import noteStackSvg from '@material-symbols/svg-700/outlined/note_stack.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { selectTemplates } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/templates')({
  component: TemplatesView,
});

/**
 * The templates shelf: notes kept for their shape rather than what they say.
 *
 * A template is an ordinary note wearing a per-user flag, so this view is the
 * archive's twin — same grid, same cards, same editor. What differs is only
 * the way out of it: a card here offers "Use template", which is the copy the
 * rest of the app already knows how to make.
 */
function TemplatesView() {
  const { t } = useTranslation('notes');
  const { data: settings } = useQuery(settingsQuery);
  const noteSort = settings?.noteSort ?? 'manual';
  const select = useCallback((notes: FullNote[]) => selectTemplates(notes, noteSort), [noteSort]);
  const { data: templates, isSuccess } = useQuery({ ...notesQuery, select });
  usePublishViewOrder(useMemo(() => (templates ?? []).map((n) => n.id), [templates]));

  if (isSuccess && templates.length === 0) {
    return <EmptyView svg={noteStackSvg} text={t('emptyStateTemplates')} />;
  }
  return (
    <div className="px-3 py-4 md:px-6 md:py-8">
      <NotesGrid notes={templates ?? []} viewMode={settings?.viewMode ?? 'grid'} />
    </div>
  );
}
