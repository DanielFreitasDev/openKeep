import type { UserSettings, UserSettingsPatch } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { userSettings } from '../../db/schema/settings.js';
import { errors } from '../../lib/errors.js';

type SettingsRow = typeof userSettings.$inferSelect;

function toDto(row: SettingsRow): UserSettings {
  return {
    addItemsToBottom: row.addItemsToBottom,
    moveCheckedToBottom: row.moveCheckedToBottom,
    richLinkPreviews: row.richLinkPreviews,
    sharingEnabled: row.sharingEnabled,
    reminderMorning: row.reminderMorning,
    reminderAfternoon: row.reminderAfternoon,
    reminderEvening: row.reminderEvening,
    timezone: row.timezone,
    viewMode: row.viewMode as UserSettings['viewMode'],
  };
}

/** Fetch settings, seeding defaults if the signup hook ever missed (defensive upsert). */
export async function getSettings(db: Db, userId: string): Promise<UserSettings> {
  const existing = await db.query.userSettings.findFirst({
    where: eq(userSettings.userId, userId),
  });
  if (existing) return toDto(existing);

  const [created] = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return toDto(created);

  const raced = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
  if (!raced) throw errors.internal('failed to initialize settings');
  return toDto(raced);
}

export async function updateSettings(
  db: Db,
  userId: string,
  patch: UserSettingsPatch,
): Promise<UserSettings> {
  await getSettings(db, userId); // ensure row exists
  const [updated] = await db
    .update(userSettings)
    .set(patch)
    .where(eq(userSettings.userId, userId))
    .returning();
  if (!updated) throw errors.internal('failed to update settings');
  return toDto(updated);
}
