import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
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

/** Mirrors the caps POST /api/import/markdown enforces per request. */
const MARKDOWN_FILES_MAX = 100;
const MARKDOWN_EXTENSIONS = /\.(md|markdown|txt)$/i;

export const importMarkdown = defineTool({
  name: 'import_markdown',
  description:
    'Import markdown as notes — up to 100 files in one call, one note per file, the first heading becoming the title. Names must end in .md, .markdown or .txt. Pass the text inline; over stdio, local paths work too. Runs inline, with no job to poll. A whole vault is better zipped through import_takeout, which reads markdown entries as well.',
  inputSchema: z.object({
    files: z
      .array(
        z.object({
          filename: z.string().min(1).max(255).describe('Name ending in .md, .markdown or .txt'),
          text: z.string().describe('The markdown source'),
        }),
      )
      .max(MARKDOWN_FILES_MAX)
      .optional()
      .describe('Files given inline'),
    paths: z
      .array(z.string())
      .max(MARKDOWN_FILES_MAX)
      .optional()
      .describe('Local file paths to read (only when the server runs on your machine via stdio)'),
  }),
  handler: async (client, args, caps) => {
    const files = [...(args.files ?? [])];
    if (args.paths?.length) {
      if (!caps.localFs) {
        throw new Error(
          'paths is only available on the stdio server running on your machine — pass files with inline text instead.',
        );
      }
      for (const path of args.paths) {
        files.push({ filename: basename(path), text: await readFile(path, 'utf8') });
      }
    }
    if (files.length === 0) throw new Error('Pass files (or paths when running via stdio).');
    if (files.length > MARKDOWN_FILES_MAX) {
      throw new Error(
        `${files.length} files — at most ${MARKDOWN_FILES_MAX} go in one call; split the batch.`,
      );
    }

    // The route drops a wrong extension without counting it anywhere, so a
    // file sent with one would simply vanish. Filter here instead and name
    // what was left out, which is the part a caller can act on.
    const accepted = files.filter((file) => MARKDOWN_EXTENSIONS.test(file.filename));
    const ignored = files
      .filter((file) => !MARKDOWN_EXTENSIONS.test(file.filename))
      .map((file) => file.filename);
    if (accepted.length === 0) {
      throw new Error(
        `No file ends in .md, .markdown or .txt — nothing to import (got: ${ignored.join(', ')}).`,
      );
    }

    const result = await client.importMarkdown(accepted);
    return {
      ...result,
      ...(ignored.length > 0 ? { ignored } : {}),
    };
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
