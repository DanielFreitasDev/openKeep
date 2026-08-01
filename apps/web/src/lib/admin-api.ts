import type { AdminMe, AdminOverview, AdminUserPage, DeleteUserResult } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

/**
 * Asked once per session by the settings menu: without it the menu would have
 * to probe an admin-only route and read a 403 as "hide the item".
 */
export const adminMeQuery = queryOptions({
  queryKey: ['admin-me'],
  queryFn: () => api<AdminMe>('/api/admin/me'),
  staleTime: Number.POSITIVE_INFINITY,
});

export const adminOverviewQuery = queryOptions({
  queryKey: ['admin-overview'],
  queryFn: () => api<AdminOverview>('/api/admin/overview'),
  staleTime: 30_000,
});

/** One page of accounts, filtered by the panel's search box. */
export const adminUsersQuery = (q: string) =>
  queryOptions({
    queryKey: ['admin-users', q],
    queryFn: () => api<AdminUserPage>(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    staleTime: 30_000,
  });

export const patchInstanceApi = (patch: { signupEnabled: boolean }) =>
  api<AdminOverview>('/api/admin/instance', { method: 'PATCH', body: patch });

export const deleteUserApi = (id: string) =>
  api<DeleteUserResult>(`/api/admin/users/${id}/delete`, {
    method: 'POST',
    body: { confirm: 'delete-user' },
  });
