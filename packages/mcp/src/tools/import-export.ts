import { readFile, stat, writeFile } from 'node:fs/promises';
import { LIMITS, zId } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

export const exportNotes = defineTool({
  name: 'export_notes',
  description:
    'Start a full export (notes, labels, settings, attachments) as a background job. Poll get_job until status=done; over stdio, download_export then saves the zip locally.',
  inputSchema: z.object({}),
  handler: async (client) => {
    const { jobId } = await client.startExport();
    return { job_id: jobId, next: 'Poll get_job until status=done, then download_export.' };
  },
});

export const getJob = defineTool({
  name: 'get_job',
  description: 'Check an import/export job: status (pending/running/done/failed) and progress.',
  inputSchema: z.object({ job_id: zId.describe('Job id from export_notes or import_takeout') }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const job = await client.getJob(args.job_id);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      progress: job.progress,
      total: job.total,
      ...(job.error !== null ? { error: job.error } : {}),
      ...(job.summary !== null ? { summary: job.summary } : {}),
      ...(job.downloadReady ? { download_ready: true } : {}),
    };
  },
});

export const downloadExport = defineTool({
  name: 'download_export',
  description:
    'Save a finished export zip to a local file (stdio only; the link expires ~24h after the job finishes).',
  inputSchema: z.object({
    job_id: zId.describe('A done export job id'),
    dest_path: z.string().describe('Local path to write the zip, e.g. ~/openkeep-export.zip'),
  }),
  stdioOnly: true,
  handler: async (client, args) => {
    const data = await client.downloadExport(args.job_id);
    await writeFile(args.dest_path, data);
    return { saved_to: args.dest_path, bytes: data.byteLength };
  },
});

export const importTakeout = defineTool({
  name: 'import_takeout',
  description:
    'Import a Google Takeout zip (the Keep folder) from a local file (stdio only, up to 512 MB). Returns a job id — poll get_job. Re-importing skips notes that already exist.',
  inputSchema: z.object({
    path: z.string().describe('Local path of the Takeout zip'),
  }),
  stdioOnly: true,
  handler: async (client, args) => {
    const info = await stat(args.path);
    if (info.size > LIMITS.importZipMaxBytes) {
      throw new Error(
        `The zip is ${Math.round(info.size / 1024 / 1024)} MB — the limit is ${LIMITS.importZipMaxBytes / 1024 / 1024} MB.`,
      );
    }
    const data = new Uint8Array(await readFile(args.path));
    const { jobId } = await client.importTakeout(data);
    return { job_id: jobId, next: 'Poll get_job until status=done.' };
  },
});
