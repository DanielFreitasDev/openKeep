import { Dialog } from '@base-ui/react/dialog';
import downloadSvg from '@material-symbols/svg-700/outlined/download.svg?raw';
import historySvg from '@material-symbols/svg-700/outlined/history.svg?raw';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatVersionStamp } from '../../lib/dates.js';
import { upsertNote } from '../../lib/note-selectors.js';
import {
  listVersions,
  notesQuery,
  restoreVersion,
  versionDownloadUrl,
} from '../../lib/notes-api.js';
import { Icon } from '../Icon.js';

interface VersionHistoryDialogProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VersionHistoryDialog({ noteId, open, onOpenChange }: VersionHistoryDialogProps) {
  const { t, i18n } = useTranslation('editor');
  const queryClient = useQueryClient();
  const { data: versions, isLoading } = useQuery({
    queryKey: ['versions', noteId],
    queryFn: () => listVersions(noteId),
    enabled: open,
  });

  const restore = async (versionId: string) => {
    const note = await restoreVersion(noteId, versionId);
    queryClient.setQueryData(notesQuery.queryKey, (old) => upsertNote(old, note));
    await queryClient.invalidateQueries({ queryKey: ['versions', noteId] });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[70vh] w-[min(90vw,440px)] flex-col rounded-lg bg-surface shadow-(--elevation-3)">
          <Dialog.Title className="px-6 pt-5 pb-2 font-medium text-lg text-on-surface">
            {t('versionHistory')}
          </Dialog.Title>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {isLoading && <p className="px-4 py-6 text-on-surface-variant text-sm">…</p>}
            {versions?.length === 0 && (
              <p className="px-4 py-6 text-on-surface-variant text-sm">{t('noVersions')}</p>
            )}
            {versions?.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-lg px-4 py-2 hover:bg-(--surface-hover)"
              >
                <Icon svg={historySvg} size={18} className="text-on-surface-variant" />
                <span className="flex-1 text-on-surface text-sm">
                  {formatVersionStamp(v.createdAt, i18n.language)}
                </span>
                <a
                  href={versionDownloadUrl(noteId, v.id)}
                  download
                  aria-label={t('downloadVersion')}
                  data-tooltip={t('downloadVersion')}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-(--surface-hover)"
                >
                  <Icon svg={downloadSvg} size={18} />
                </a>
                <button
                  type="button"
                  className="rounded px-3 py-1.5 font-medium text-primary text-sm hover:bg-(--surface-hover)"
                  onClick={() => void restore(v.id)}
                >
                  {t('restoreVersion')}
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end px-4 pb-4">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:close')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
