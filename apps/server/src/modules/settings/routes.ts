import { zStorageUsage, zUserSettings, zUserSettingsPatch } from '@openkeep/shared';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import type { Realtime } from '../../realtime/registry.js';
import { usedStorageBytes } from '../attachments/service.js';
import { getSettings, updateSettings } from './service.js';

export function registerSettingsRoutes(app: App, db: Db, realtime: Realtime, config: Config): void {
  /**
   * What this account is using, and against what. Readable through a PAT like
   * the rest of the account's own data — a client that can fill the disk is
   * entitled to know how full it is.
   */
  app.get(
    '/api/storage',
    {
      preHandler: [app.requireAuth],
      schema: { tags: ['settings'], response: { 200: zStorageUsage } },
    },
    async (req) => ({
      usedBytes: await usedStorageBytes(db, req.user.id),
      quotaBytes: config.storageQuotaBytes,
    }),
  );

  app.get(
    '/api/settings',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['settings'],
        response: { 200: zUserSettings },
      },
    },
    async (req) => getSettings(db, req.user.id),
  );

  app.patch(
    '/api/settings',
    {
      preHandler: [app.requireAuth],
      schema: {
        tags: ['settings'],
        body: zUserSettingsPatch,
        response: { 200: zUserSettings },
      },
    },
    async (req) => {
      const settings = await updateSettings(db, req.user.id, req.body);
      realtime.publishToUsers(
        [req.user.id],
        { type: 'settings.updated', payload: settings },
        req.headers['x-client-id'] as string | undefined,
      );
      return settings;
    },
  );
}
