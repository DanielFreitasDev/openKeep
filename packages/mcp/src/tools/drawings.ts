import type { DrawingData } from '@openkeep/shared';
import { LIMITS, zDrawingData, zId } from '@openkeep/shared';
import { z } from 'zod';
import { renderDrawingPng } from '../drawing-png.js';
import { bytesFrom } from './attachments.js';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
const zAttachmentId = zId.describe('Drawing attachment id (uuid)');

/**
 * The vectors, described for a caller that has never seen the editor. The
 * shape is the app's own `zDrawingData`, so a drawing read back with
 * get_drawing can be edited and written straight back.
 */
const zDrawing = z
  .object({
    version: z.literal(1),
    width: z
      .number()
      .int()
      .min(16)
      .max(LIMITS.drawingSideMax)
      .describe('Canvas width in px — stroke coordinates are in this space'),
    height: z.number().int().min(16).max(LIMITS.drawingSideMax).describe('Canvas height in px'),
    background: z
      .enum(['none', 'squares', 'dots', 'rules'])
      .describe('Paper pattern under the ink'),
    strokes: z
      .array(
        z.object({
          tool: z
            .enum(['pen', 'marker', 'highlighter'])
            .describe('pen and marker are opaque; highlighter is translucent'),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .describe('Ink colour, #rrggbb'),
          size: z.number().min(0.5).max(200).describe('Stroke width in canvas px'),
          points: z
            .array(z.number())
            .min(2)
            .max(LIMITS.drawingPointsPerStrokeMax * 2)
            .describe('Flat [x0, y0, x1, y1, …]; a single pair draws a dot'),
        }),
      )
      .max(LIMITS.drawingStrokesMax)
      .describe('Painted in order — later strokes cover earlier ones'),
    photoAttachmentId: zId
      .nullish()
      .describe(
        'Image attachment on the same note used as the backdrop, when the ink sits on a photo',
      ),
  })
  .describe('The drawing’s editable vectors');

const zPngBase64 = z
  .string()
  .optional()
  .describe(
    'PNG render of these strokes, base64-encoded. Omit and one is rasterized from the vectors.',
  );
const zPngPath = z
  .string()
  .optional()
  .describe('Local path of a PNG render (only when the server runs on your machine via stdio)');

/**
 * The picture that gets stored beside the vectors. A caller that already has a
 * render sends it; otherwise the strokes are rasterized here, which is the
 * whole reason an agent can make a drawing at all. A drawing over a photo is
 * the one case that cannot be rasterized without the photo, so it says so.
 */
async function renderFor(
  args: { png_base64?: string | undefined; path?: string | undefined },
  drawing: DrawingData,
  caps: { localFs: boolean },
): Promise<Uint8Array> {
  if (args.png_base64 !== undefined || args.path !== undefined) {
    return bytesFrom({ data_base64: args.png_base64, path: args.path }, caps);
  }
  if (drawing.photoAttachmentId) {
    throw new Error(
      'A drawing over a photo cannot be rendered from its strokes alone — pass png_base64 (or path) with the flattened image.',
    );
  }
  return new Uint8Array(renderDrawingPng(drawing));
}

/** What is worth reporting back about a stored drawing. */
function stored(attachment: {
  id: string;
  mime: string;
  width: number | null;
  height: number | null;
}) {
  return {
    attachment_id: attachment.id,
    mime: attachment.mime,
    width: attachment.width,
    height: attachment.height,
  };
}

export const getDrawing = defineTool({
  name: 'get_drawing',
  description:
    'Read a drawing’s editable stroke vectors (get_attachment returns the flat picture instead). Feed the result back to update_drawing to change it without redrawing from scratch.',
  inputSchema: z.object({ attachment_id: zAttachmentId }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const drawing = await client.getDrawing(args.attachment_id);
    return {
      attachment_id: args.attachment_id,
      ...drawing,
      stroke_count: drawing.strokes.length,
    };
  },
});

export const createDrawing = defineTool({
  name: 'create_drawing',
  description:
    'Attach a drawing to a note from stroke vectors — coordinates in a canvas of the given width/height, painted in order. A PNG render is produced from the strokes automatically, so the vectors alone are enough; pass png_base64 only when you already have the picture (and always for a drawing over a photo).',
  inputSchema: z.object({
    note_id: zNoteId,
    drawing: zDrawing,
    png_base64: zPngBase64,
    path: zPngPath,
  }),
  handler: async (client, args, caps) => {
    const drawing = zDrawingData.parse(args.drawing);
    const png = await renderFor(args, drawing, caps);
    const attachment = await client.createDrawing(args.note_id, png, drawing);
    return { note_id: args.note_id, ...stored(attachment) };
  },
});

export const updateDrawing = defineTool({
  name: 'update_drawing',
  description:
    'Replace an existing drawing’s strokes in place, keeping its attachment id and its position on the note. Read the current vectors with get_drawing first — this overwrites them wholesale rather than adding to them.',
  inputSchema: z.object({
    attachment_id: zAttachmentId,
    drawing: zDrawing,
    png_base64: zPngBase64,
    path: zPngPath,
  }),
  handler: async (client, args, caps) => {
    const drawing = zDrawingData.parse(args.drawing);
    const png = await renderFor(args, drawing, caps);
    const attachment = await client.updateDrawing(args.attachment_id, png, drawing);
    return stored(attachment);
  },
});
