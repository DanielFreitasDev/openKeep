import type { Reminder, SetReminder } from '@openkeep/shared';
import { api } from './api.js';

export const setReminderApi = (noteId: string, body: SetReminder) =>
  api<Reminder>(`/api/notes/${noteId}/reminder`, { method: 'PUT', body });

export const deleteReminderApi = (noteId: string) =>
  api<undefined>(`/api/notes/${noteId}/reminder`, { method: 'DELETE' });

export const snoozeReminderApi = (noteId: string, until: string) =>
  api<Reminder>(`/api/notes/${noteId}/reminder/snooze`, { method: 'POST', body: { until } });

export const dismissReminderApi = (noteId: string) =>
  api<undefined>(`/api/notes/${noteId}/reminder/dismiss`, { method: 'POST' });

export const getVapidKey = () => api<{ key: string }>('/api/push/vapid-public-key');

export const savePushSubscription = (sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) => api<undefined>('/api/push/subscriptions', { method: 'POST', body: sub });
