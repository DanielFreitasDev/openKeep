import { Dialog } from '@base-ui/react/dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../lib/api.js';
import { clientId } from '../../lib/client-id.js';
import { labelsQuery } from '../../lib/labels-api.js';
import { notesQuery } from '../../lib/notes-api.js';
import { useUiStore } from '../../stores/ui.js';

interface JobDto {
  id: string;
  kind: 'import' | 'export';
  status: 'pending' | 'running' | 'done' | 'failed';
  progress: number;
  total: number;
  error: string | null;
  summary: string | null;
  downloadReady: boolean;
}

function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api<JobDto>(`/api/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (q) =>
      q.state.data?.status === 'done' || q.state.data?.status === 'failed' ? false : 1200,
  });
}

/** Takeout import + JSON export (our adoption features — not in real Keep). */
export function ImportExportDialog() {
  const { t } = useTranslation('importExport');
  const activeDialog = useUiStore((s) => s.activeDialog);
  const setActiveDialog = useUiStore((s) => s.setActiveDialog);
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importJob = useJob(importJobId);
  const exportJob = useJob(exportJobId);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/import/takeout', {
        method: 'POST',
        body: fd,
        headers: { 'x-client-id': clientId },
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new ApiError(
          problem ?? {
            type: 'about:blank',
            title: res.statusText,
            status: res.status,
            code: 'internal_error',
          },
        );
      }
      return (await res.json()) as { jobId: string };
    },
    onSuccess: ({ jobId }) => {
      setError(null);
      setImportJobId(jobId);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : t('failed')),
  });

  const startExport = useMutation({
    mutationFn: () => api<{ jobId: string }>('/api/export', { method: 'POST' }),
    onSuccess: ({ jobId }) => setExportJobId(jobId),
  });

  if (activeDialog !== 'import-export') return null;

  if (importJob.data?.status === 'done') {
    // Imported notes should appear without a manual refresh.
    void queryClient.invalidateQueries({ queryKey: notesQuery.queryKey });
    void queryClient.invalidateQueries({ queryKey: labelsQuery.queryKey });
  }

  const jobLine = (job: JobDto | undefined) => {
    if (!job) return null;
    if (job.status === 'failed')
      return <p className="text-red-600 text-sm dark:text-red-400">{t('failed')}</p>;
    if (job.status === 'done') {
      const summary = job.summary ? (JSON.parse(job.summary) as Record<string, number>) : {};
      return (
        <p className="text-on-surface text-sm">
          {job.kind === 'import'
            ? t('importDone', { imported: summary.imported ?? 0, skipped: summary.skipped ?? 0 })
            : t('exportDone', { notes: summary.notes ?? 0 })}
        </p>
      );
    }
    return (
      <p className="text-on-surface-variant text-sm">
        {t('working')} {job.total > 0 ? `${job.progress}/${job.total}` : '…'}
      </p>
    );
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setActiveDialog(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[min(92vw,440px)] rounded-lg bg-surface p-6 shadow-(--elevation-3)">
          <Dialog.Title className="font-medium text-lg text-on-surface">{t('title')}</Dialog.Title>

          <section className="mt-4">
            <h3 className="font-medium text-on-surface text-sm">{t('importTitle')}</h3>
            <p className="mt-1 text-on-surface-variant text-xs">{t('importHint')}</p>
            <input
              ref={fileRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) upload.mutate(file);
              }}
            />
            <button
              type="button"
              disabled={upload.isPending || importJob.data?.status === 'running'}
              className="mt-2 rounded-full border border-(--outline) px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-50"
              onClick={() => fileRef.current?.click()}
            >
              {t('chooseZip')}
            </button>
            <div className="mt-2">{jobLine(importJob.data)}</div>
            {error && <p className="mt-1 text-red-600 text-sm dark:text-red-400">{error}</p>}
          </section>

          <section className="mt-6 border-(--outline-variant) border-t pt-4">
            <h3 className="font-medium text-on-surface text-sm">{t('exportTitle')}</h3>
            <p className="mt-1 text-on-surface-variant text-xs">{t('exportHint')}</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                disabled={startExport.isPending || exportJob.data?.status === 'running'}
                className="rounded-full border border-(--outline) px-4 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-50"
                onClick={() => startExport.mutate()}
              >
                {t('startExport')}
              </button>
              {exportJob.data?.downloadReady && exportJobId && (
                <a
                  href={`/api/jobs/${exportJobId}/download`}
                  download
                  className="font-medium text-primary text-sm hover:underline"
                >
                  {t('download')}
                </a>
              )}
            </div>
            <div className="mt-2">{jobLine(exportJob.data)}</div>
          </section>

          <div className="mt-6 flex justify-end">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:done')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
