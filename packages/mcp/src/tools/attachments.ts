import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { FILE_EXTENSIONS_LABEL, zId } from '@openkeep/shared';
import { z } from 'zod';
import { AudioOutput, defineTool, FileOutput, ImageOutput } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
const zAttachmentId = zId.describe('Attachment id (uuid)');

/**
 * Bytes for an upload: base64 over any transport, or a local path when the
 * server runs on the user's own machine (stdio). Shared by every upload tool
 * so they answer the same way when neither is given.
 */
export async function bytesFrom(
  args: { data_base64?: string | undefined; path?: string | undefined },
  caps: { localFs: boolean },
): Promise<Uint8Array> {
  if (args.path !== undefined) {
    if (!caps.localFs) {
      throw new Error(
        'path is only available on the stdio server running on your machine — pass data_base64 instead.',
      );
    }
    return new Uint8Array(await readFile(args.path));
  }
  if (args.data_base64 !== undefined) {
    return new Uint8Array(Buffer.from(args.data_base64, 'base64'));
  }
  throw new Error('Pass data_base64 (or path when running via stdio).');
}

const zDataBase64 = z.string().optional().describe('File bytes, base64-encoded');
const zLocalPath = z
  .string()
  .optional()
  .describe('Local file path (only when the server runs on your machine via stdio)');

/** The attachment fields worth handing back after an upload. */
function uploaded(attachment: {
  id: string;
  kind: string;
  mime: string;
  width: number | null;
  height: number | null;
  filename: string | null;
}) {
  return {
    id: attachment.id,
    kind: attachment.kind,
    mime: attachment.mime,
    width: attachment.width,
    height: attachment.height,
    filename: attachment.filename,
  };
}

export const uploadImage = defineTool({
  name: 'upload_image',
  description:
    'Attach an image to a note (jpeg/png/webp/gif, up to 10 MB). Pass the bytes as data_base64; when running locally over stdio, a filesystem path works too.',
  inputSchema: z.object({
    note_id: zNoteId,
    data_base64: zDataBase64.describe('Image bytes, base64-encoded'),
    path: zLocalPath,
    filename: z.string().max(200).optional().describe('Filename hint (default image.png)'),
  }),
  handler: async (client, args, caps) => {
    const data = await bytesFrom(args, caps);
    return uploaded(await client.uploadImage(args.note_id, data, args.filename));
  },
});

export const uploadAudio = defineTool({
  name: 'upload_audio',
  description:
    'Attach an audio recording to a note (webm/ogg/mp4/m4a/mp3/wav, up to 20 MB). The format is decided by the bytes, not by the filename.',
  inputSchema: z.object({
    note_id: zNoteId,
    data_base64: zDataBase64.describe('Audio bytes, base64-encoded'),
    path: zLocalPath,
    filename: z.string().max(200).optional().describe('Filename hint (default audio.webm)'),
  }),
  handler: async (client, args, caps) => {
    const data = await bytesFrom(args, caps);
    return uploaded(await client.uploadAudio(args.note_id, data, args.filename));
  },
});

export const uploadFile = defineTool({
  name: 'upload_file',
  description: `Attach an arbitrary file to a note — ${FILE_EXTENSIONS_LABEL}, up to 25 MB. The filename is required and is what the note's chip shows and what a download is named; its extension has to match the actual bytes. Images and audio have their own tools.`,
  inputSchema: z.object({
    note_id: zNoteId,
    filename: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Name to store the file under, extension included (e.g. "report.pdf"). Optional only when path is given — the basename is then used.',
      ),
    data_base64: zDataBase64,
    path: zLocalPath,
  }),
  handler: async (client, args, caps) => {
    const data = await bytesFrom(args, caps);
    // A path names the file when the caller did not: on stdio the basename is
    // the name the user already knows it by.
    const filename = args.filename ?? (args.path ? basename(args.path) : undefined);
    if (!filename) {
      throw new Error('Pass filename — a file is stored and downloaded under its name.');
    }
    return uploaded(await client.uploadFile(args.note_id, data, filename));
  },
});

/** Text-ish payloads are worth decoding — the model can act on the content. */
function isTextMime(mime: string): boolean {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/x-yaml'
  );
}

export const getAttachment = defineTool({
  name: 'get_attachment',
  description:
    'Download an attachment. Images come back as an image the model can see (the thumbnail by default; pass variant=file for the original), audio as audio, a text file as its text, and anything else as an embedded resource.',
  inputSchema: z.object({
    attachment_id: zAttachmentId,
    variant: z
      .enum(['thumb', 'file'])
      .optional()
      .describe(
        'thumb (resized, images and drawings only) or file (the original). Defaults to the thumbnail when there is one.',
      ),
  }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    // Audio and files carry no thumbnail, so the historical `thumb` default
    // would 404 on them. Only an explicit variant is taken at face value.
    let variant = args.variant ?? 'thumb';
    let payload: { data: Uint8Array; mime: string };
    try {
      payload = await client.downloadAttachment(args.attachment_id, variant);
    } catch (err) {
      if (args.variant !== undefined || variant !== 'thumb') throw err;
      variant = 'file';
      payload = await client.downloadAttachment(args.attachment_id, 'file');
    }

    const { data, mime } = payload;
    const meta = {
      attachment_id: args.attachment_id,
      variant,
      mime,
      bytes: data.byteLength,
    };
    if (mime.startsWith('image/')) {
      return new ImageOutput(Buffer.from(data).toString('base64'), mime, meta);
    }
    if (mime.startsWith('audio/')) {
      return new AudioOutput(Buffer.from(data).toString('base64'), mime, meta);
    }
    if (isTextMime(mime)) {
      return { ...meta, text: Buffer.from(data).toString('utf8') };
    }
    return new FileOutput(
      `openkeep://attachments/${args.attachment_id}`,
      Buffer.from(data).toString('base64'),
      mime,
      meta,
    );
  },
});

export const deleteAttachment = defineTool({
  name: 'delete_attachment',
  description: 'Delete an attachment from its note (irreversible).',
  inputSchema: z.object({ attachment_id: zAttachmentId }),
  annotations: { destructiveHint: true },
  handler: async (client, args) => {
    await client.deleteAttachment(args.attachment_id);
    return { deleted: true };
  },
});
