import type { ApiToken, ApiTokenWithSecret, CreateApiToken } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

export const tokensQuery = queryOptions({
  queryKey: ['api-tokens'],
  queryFn: () => api<ApiToken[]>('/api/tokens'),
  staleTime: 60_000,
});

export const createTokenApi = (input: CreateApiToken) =>
  api<ApiTokenWithSecret>('/api/tokens', { method: 'POST', body: input });

export const revokeTokenApi = (id: string) =>
  api<undefined>(`/api/tokens/${id}`, { method: 'DELETE' });
