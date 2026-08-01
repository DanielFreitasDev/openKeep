import type { Attachment, DrawingData, LinkPreview } from '@openkeep/shared';
import { ApiError, api } from './api.js';
import { clientId } from './client-id.js';

// `v` cache-busts the immutable URLs when a drawing is re-saved in place.
export const attachmentFileUrl = (id: string, v?: string) =>
  `/api/attachments/${id}/file${v ? `?v=${encodeURIComponent(v)}` : ''}`;
export const attachmentThumbUrl = (id: string, v?: string) =>
  `/api/attachments/${id}/thumb${v ? `?v=${encodeURIComponent(v)}` : ''}`;

async function postMultipart(
  url: string,
  method: 'POST' | 'PUT',
  fd: FormData,
): Promise<Attachment> {
  const res = await fetch(url, {
    method,
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

export function uploadAttachment(noteId: string, file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  return postMultipart(`/api/notes/${noteId}/attachments`, 'POST', fd);
}

/** Browser recordings go to their own route: bigger cap, no image pipeline. */
export function uploadAudioApi(noteId: string, file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  return postMultipart(`/api/notes/${noteId}/audio`, 'POST', fd);
}

/** Any other file: its own route (own byte cap, no image pipeline). */
export function uploadFileApi(noteId: string, file: File): Promise<Attachment> {
  const fd = new FormData();
  fd.append('file', file);
  return postMultipart(`/api/notes/${noteId}/files`, 'POST', fd);
}

function drawingFormData(file: File, drawing: DrawingData): FormData {
  const fd = new FormData();
  // The JSON field goes before the file: the server reads buffered fields
  // off the file part, and busboy only buffers what it has already seen.
  fd.append('drawing', JSON.stringify(drawing));
  fd.append('file', file);
  return fd;
}

export const uploadDrawingApi = (noteId: string, file: File, drawing: DrawingData) =>
  postMultipart(`/api/notes/${noteId}/drawings`, 'POST', drawingFormData(file, drawing));

export const updateDrawingApi = (attachmentId: string, file: File, drawing: DrawingData) =>
  postMultipart(`/api/attachments/${attachmentId}/drawing`, 'PUT', drawingFormData(file, drawing));

export const fetchDrawingData = (attachmentId: string) =>
  api<DrawingData>(`/api/attachments/${attachmentId}/drawing`);

export const deleteAttachmentApi = (id: string) =>
  api<undefined>(`/api/attachments/${id}`, { method: 'DELETE' });

export const fetchLinkPreview = (url: string) =>
  api<LinkPreview>(`/api/link-previews?url=${encodeURIComponent(url)}`);
