import { inArray } from 'drizzle-orm';
import webpush from 'web-push';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { pushSubscriptions } from '../../db/schema/reminders.js';
import type { FiredReminder } from './service.js';

export function configureWebPush(config: Config): boolean {
  if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    config.VAPID_SUBJECT ?? 'mailto:admin@localhost',
    config.VAPID_PUBLIC_KEY,
    config.VAPID_PRIVATE_KEY,
  );
  return true;
}

/** Sends push for fired reminders; prunes dead subscriptions on 404/410. */
export async function pushFiredReminders(db: Db, fired: FiredReminder[]): Promise<void> {
  const userIds = [...new Set(fired.map((f) => f.userId))];
  if (userIds.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));

  const dead: string[] = [];
  for (const f of fired) {
    const payload = JSON.stringify({
      type: 'reminder',
      noteId: f.noteId,
      title: f.noteTitle,
      remindAt: f.remindAt.toISOString(),
    });
    for (const sub of subs.filter((s) => s.userId === f.userId)) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 3600 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
      }
    }
  }
  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, dead));
  }
}
