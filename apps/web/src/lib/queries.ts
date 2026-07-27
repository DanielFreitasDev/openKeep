import type { InstanceMeta, UserSettings, UserSettingsPatch } from '@openkeep/shared';
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

export function patchSettings(patch: UserSettingsPatch) {
  return api<UserSettings>('/api/settings', { method: 'PATCH', body: patch });
}
