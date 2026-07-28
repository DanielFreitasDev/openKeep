import { readFile } from 'node:fs/promises';
import { zId } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool, ImageOutput } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
const zAttachmentId = zId.describe('Attachment id (uuid)');

export const uploadImage = defineTool({
  name: 'upload_image',
  description:
    'Attach an image to a note (jpeg/png/webp/gif, up to 10 MB). Pass the bytes as data_base64; when running locally over stdio, a filesystem path works too.',
  inputSchema: z.object({
    note_id: zNoteId,
    data_base64: z.string().optional().describe('Image bytes, base64-encoded'),
    path: z
      .string()
      .optional()
      .describe('Local image file path (only when the server runs on your machine via stdio)'),
    filename: z.string().max(200).optional().describe('Filename hint (default image.png)'),
  }),
  handler: async (client, args, caps) => {
    let data: Uint8Array;
    if (args.path !== undefined) {
      if (!caps.localFs) {
        throw new Error(
          'path is only available on the stdio server running on your machine — pass data_base64 instead.',
        );
      }
      data = new Uint8Array(await readFile(args.path));
    } else if (args.data_base64 !== undefined) {
      data = new Uint8Array(Buffer.from(args.data_base64, 'base64'));
    } else {
      throw new Error('Pass data_base64 (or path when running via stdio).');
    }
    const attachment = await client.uploadImage(args.note_id, data, args.filename);
    return {
      id: attachment.id,
      kind: attachment.kind,
      mime: attachment.mime,
      width: attachment.width,
      height: attachment.height,
    };
  },
});

export const getAttachment = defineTool({
  name: 'get_attachment',
  description:
    'Download an attachment as an image the model can see. Defaults to the thumbnail (cheaper); pass variant=file for the original.',
  inputSchema: z.object({
    attachment_id: zAttachmentId,
    variant: z
      .enum(['thumb', 'file'])
      .optional()
      .describe('thumb (default, resized) or file (original)'),
  }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const variant = args.variant ?? 'thumb';
    const { data, mime } = await client.downloadAttachment(args.attachment_id, variant);
    return new ImageOutput(Buffer.from(data).toString('base64'), mime, {
      attachment_id: args.attachment_id,
      variant,
      bytes: data.byteLength,
    });
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
