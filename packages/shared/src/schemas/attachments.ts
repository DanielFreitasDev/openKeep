import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
import { zId } from './common.js';

export const zAttachmentKind = z.enum(['image', 'audio', 'drawing', 'file']);

export const zAttachment = z.object({
  id: zId,
  kind: zAttachmentKind,
  mime: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  /** The name a `kind='file'` attachment is shown and downloaded under; null otherwise. */
  filename: z.string().nullable(),
  hasThumb: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Bumped when a drawing is re-saved — clients cache-bust file/thumb URLs with it. */
  updatedAt: z.iso.datetime(),
});
export type Attachment = z.infer<typeof zAttachment>;

/** Keep drawing toolbar tools (the eraser removes strokes, it is not stored). */
export const zDrawingTool = z.enum(['pen', 'marker', 'highlighter']);
export type DrawingTool = z.infer<typeof zDrawingTool>;

export const zDrawingBackground = z.enum(['none', 'squares', 'dots', 'rules']);
export type DrawingBackground = z.infer<typeof zDrawingBackground>;

export const zDrawingStroke = z.object({
  tool: zDrawingTool,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Stroke width in canvas px. */
  size: z.number().min(0.5).max(200),
  /** Flat [x0, y0, x1, y1, …] in canvas coordinates. */
  points: z
    .array(z.number())
    .min(2)
    .max(LIMITS.drawingPointsPerStrokeMax * 2)
    .refine((p) => p.length % 2 === 0, 'points must be x,y pairs'),
});
export type DrawingStroke = z.infer<typeof zDrawingStroke>;

/** The editable vector form of a drawing; the PNG is its rendered export. */
export const zDrawingData = z.object({
  version: z.literal(1),
  width: z.number().int().min(16).max(LIMITS.drawingSideMax),
  height: z.number().int().min(16).max(LIMITS.drawingSideMax),
  background: zDrawingBackground,
  strokes: z.array(zDrawingStroke).max(LIMITS.drawingStrokesMax),
});
export type DrawingData = z.infer<typeof zDrawingData>;

export const zLinkPreview = z.object({
  url: z.string(),
  status: z.enum(['pending', 'ok', 'failed', 'disabled']),
  title: z.string().nullable(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type LinkPreview = z.infer<typeof zLinkPreview>;

/** First N http(s) URLs from plain text (client + server share the rule). */
export function extractUrls(text: string, max = 3): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const unique: string[] = [];
  for (const raw of found) {
    const cleaned = raw.replace(/[.,;:!?]+$/, '');
    if (!unique.includes(cleaned)) unique.push(cleaned);
    if (unique.length >= max) break;
  }
  return unique;
}
