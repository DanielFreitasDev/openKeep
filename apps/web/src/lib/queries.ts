import type { InstanceMeta, StorageUsage, UserSettings, UserSettingsPatch } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';
import { authClient } from './auth-client.js';

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async () => {
    const { data } = await authClient.getSession();
    return data ?? null;
  },
  staleTime: 60_000,
});

export const metaQuery = queryOptions({
  queryKey: ['meta'],
  queryFn: () => api<InstanceMeta>('/api/meta'),
  staleTime: Number.POSITIVE_INFINITY,
});

export const settingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: () => api<UserSettings>('/api/settings'),
  staleTime: 60_000,
});

/**
 * Disk this account is using and the instance's ceiling, if it sets one.
 * Refetched after every upload, since that is the only thing that moves it
 * from this tab — and re-read on mount, since another device moves it too.
 */
export const storageQuery = queryOptions({
  queryKey: ['storage'],
  queryFn: () => api<StorageUsage>('/api/storage'),
  staleTime: 30_000,
});

export function patchSettings(patch: UserSettingsPatch) {
  return api<UserSettings>('/api/settings', { method: 'PATCH', body: patch });
}
