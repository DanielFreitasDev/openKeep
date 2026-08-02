import type { CreateWebhook, UpdateWebhook, Webhook, WebhookTestResult } from '@openkeep/shared';
import { queryOptions } from '@tanstack/react-query';
import { api } from './api.js';

export const webhooksQuery = queryOptions({
  queryKey: ['webhooks'],
  queryFn: () => api<Webhook[]>('/api/webhooks'),
  staleTime: 60_000,
});

export const createWebhookApi = (input: CreateWebhook) =>
  api<Webhook>('/api/webhooks', { method: 'POST', body: input });

export const updateWebhookApi = (id: string, input: UpdateWebhook) =>
  api<Webhook>(`/api/webhooks/${id}`, { method: 'PATCH', body: input });

export const deleteWebhookApi = (id: string) =>
  api<undefined>(`/api/webhooks/${id}`, { method: 'DELETE' });

export const testWebhookApi = (id: string) =>
  api<WebhookTestResult>(`/api/webhooks/${id}/test`, { method: 'POST' });
