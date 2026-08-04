import type { OauthClient, OauthConnection } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

export const oauthClientQuery = (clientId: string) =>
  queryOptions({
    queryKey: ['oauth-client', clientId],
    queryFn: () => api<OauthClient>(`/api/oauth/clients/${encodeURIComponent(clientId)}`),
    staleTime: 60_000,
  });

export const oauthConnectionsQuery = queryOptions({
  queryKey: ['oauth-connections'],
  queryFn: () => api<OauthConnection[]>('/api/oauth/connections'),
  staleTime: 60_000,
});

export const revokeConnectionApi = (clientId: string) =>
  api<undefined>(`/api/oauth/connections/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
