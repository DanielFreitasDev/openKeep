import { z } from 'zod';
import { zId } from './common.js';

export const zAttachmentKind = z.enum(['image', 'audio', 'drawing']);

export const zAttachment = z.object({
  id: zId,
  kind: zAttachmentKind,
  mime: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  hasThumb: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Attachment = z.infer<typeof zAttachment>;

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
