// OpenKeep push service worker (M6). Replaced by the Workbox PWA worker in M8.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    return;
  }
  if (data.type !== 'reminder') return;
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: 'OpenKeep reminder',
      icon: '/favicon.svg',
      tag: `reminder-${data.noteId}`,
      data: { noteId: data.noteId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const noteId = event.notification.data?.noteId;
  const url = noteId ? `/?note=${noteId}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
