import { useEffect } from 'react';
import { getVapidKey, savePushSubscription } from '../lib/reminders-api.js';

function base64UrlToUint8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Registers the push service worker and subscription when the server has
 * VAPID configured and the user has granted notification permission.
 * Permission is requested lazily (first reminder set) via requestPushPermission.
 */
export function usePushRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    void registerPush();
  }, []);
}

export async function requestPushPermission(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') await registerPush();
}

async function registerPush(): Promise<void> {
  try {
    const { key } = await getVapidKey();
    const registration = await navigator.serviceWorker.register('/sw.js');
    const existing = await registration.pushManager.getSubscription();
    const sub =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8(key) as BufferSource,
      }));
    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
      await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
    }
  } catch {
    // Push unavailable (no VAPID configured / permission denied) — fine.
  }
}
