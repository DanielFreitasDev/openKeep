import type { PublicNote, ShareLink } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

export const shareLinkQuery = (noteId: string) =>
  queryOptions({
    queryKey: ['share-link', noteId],
    queryFn: () => api<ShareLink>(`/api/notes/${noteId}/share-link`),
    staleTime: 30_000,
  });

export const createShareLink = (noteId: string, expiresInDays: number | null) =>
  api<ShareLink>(`/api/notes/${noteId}/share-link`, {
    method: 'POST',
    body: { expiresInDays },
  });

export const revokeShareLink = (noteId: string) =>
  api<undefined>(`/api/notes/${noteId}/share-link`, { method: 'DELETE' });

/** The reader's side: no session anywhere on this path, the token is it. */
export const publicNoteQuery = (token: string) =>
  queryOptions({
    queryKey: ['public-note', token],
    queryFn: () => api<PublicNote>(`/api/public/notes/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: 30_000,
  });

export const publicAttachmentUrl = (
  token: string,
  attachmentId: string,
  variant: 'file' | 'thumb',
  v?: string,
) =>
  `/api/public/notes/${encodeURIComponent(token)}/attachments/${attachmentId}/${variant}${
    v ? `?v=${encodeURIComponent(v)}` : ''
  }`;
