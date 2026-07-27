import type { Attachment, LinkPreview } from '@openkeep/shared';
import { ApiError, api } from './api.js';
import { clientId } from './client-id.js';

export const attachmentFileUrl = (id: string) => `/api/attachments/${id}/file`;
export const attachmentThumbUrl = (id: string) => `/api/attachments/${id}/thumb`;

export async function uploadAttachment(noteId: string, file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/notes/${noteId}/attachments`, {
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
  return (await res.json()) as Attachment;
}

export const deleteAttachmentApi = (id: string) =>
  api<undefined>(`/api/attachments/${id}`, { method: 'DELETE' });

export const fetchLinkPreview = (url: string) =>
  api<LinkPreview>(`/api/link-previews?url=${encodeURIComponent(url)}`);
