import deleteSvg from '@material-symbols/svg-400/outlined/delete.svg?raw';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { ConfirmDialog } from '../../components/notes/ConfirmDialog.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { selectTrashed } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { settingsQuery } from '../../lib/queries.js';

export const Route = createFileRoute('/_shell/trash')({
  component: TrashView,
});

function TrashView() {
  const { t } = useTranslation('trash');
  const { data: trashed, isSuccess } = useQuery({ ...notesQuery, select: selectTrashed });
  const { data: settings } = useQuery(settingsQuery);
  const m = useNoteMutations();
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const isEmpty = isSuccess && (trashed?.length ?? 0) === 0;

  return (
    <div className="px-6 py-4">
      <div className="mx-auto mb-4 flex max-w-[960px] items-center justify-center gap-4">
        <p className="text-on-surface text-sm italic">{t('banner')}</p>
        {!isEmpty && (
          <button
            type="button"
            className="rounded px-3 py-1.5 font-medium text-primary text-sm hover:bg-(--surface-hover)"
            onClick={() => setConfirmEmpty(true)}
          >
            {t('emptyTrashAction')}
          </button>
        )}
      </div>
      {isEmpty ? (
        <EmptyView svg={deleteSvg} text={t('emptyStateTrash')} />
      ) : (
        <NotesGrid notes={trashed ?? []} viewMode={settings?.viewMode ?? 'grid'} />
      )}
      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        text={t('confirmEmptyTrash')}
        confirmLabel={t('emptyTrashAction')}
        onConfirm={() => m.emptyTrash.mutate()}
      />
    </div>
  );
}
