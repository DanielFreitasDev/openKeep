/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

// App shell + assets (fonts, backgrounds) — injected at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/**
 * Some server URLs are reached by a TOP-LEVEL NAVIGATION instead of by fetch:
 * the OAuth callback the provider redirects the browser back to, an export
 * download, an attachment opened in a new tab. None of them is the app shell
 * and none of them is cacheable, so the worker must stand aside and let the
 * browser make the request itself. Answering an OAuth callback from the
 * precache hands the router a route it does not have — it renders "Not Found"
 * and social sign-in is broken for every controlled client while the server is
 * perfectly healthy.
 */
const isApiNavigation = ({ url, request }: { url: URL; request: Request }) =>
  url.pathname.startsWith('/api/') && request.mode === 'navigate';

// SPA navigations (any route, e.g. /archive) fall back to the precached shell,
// so an offline reload boots the app instead of failing the navigation.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
);

// API reads: network-first with a 3s timeout, cache fallback (offline reads).
registerRoute(
  (options) =>
    options.url.pathname.startsWith('/api/') &&
    options.request.method === 'GET' &&
    !options.url.pathname.startsWith('/api/ws') &&
    !options.url.pathname.startsWith('/api/attachments/') &&
    !isApiNavigation(options),
  new NetworkFirst({
    cacheName: 'api-reads',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 })],
  }),
);

// Attachments: immutable, cache-first for 30 days.
registerRoute(
  (options) =>
    options.url.pathname.startsWith('/api/attachments/') &&
    options.request.method === 'GET' &&
    !isApiNavigation(options),
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
