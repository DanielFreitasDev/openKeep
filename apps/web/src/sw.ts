/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

// App shell + assets (fonts, backgrounds) — injected at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// API reads: network-first with a 3s timeout, cache fallback (offline reads).
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    request.method === 'GET' &&
    !url.pathname.startsWith('/api/ws') &&
    !url.pathname.startsWith('/api/attachments/'),
  new NetworkFirst({
    cacheName: 'api-reads',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 })],
  }),
);

// Attachments: immutable, cache-first for 30 days.
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/attachments/') && request.method === 'GET',
  new CacheFirst({
    cacheName: 'attachments',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 })],
  }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// ---------------------------------------------------------------- push

interface ReminderPush {
  type: 'reminder';
  noteId: string;
  title: string;
  remindAt: string;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: ReminderPush;
  try {
    data = event.data.json() as ReminderPush;
  } catch {
    return;
  }
  if (data.type !== 'reminder') return;
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: 'OpenKeep reminder',
      icon: '/pwa-192.png',
      tag: `reminder-${data.noteId}`,
      data: { noteId: data.noteId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const noteId = (event.notification.data as { noteId?: string } | undefined)?.noteId;
  const url = noteId ? `/?note=${noteId}` : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          void client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
