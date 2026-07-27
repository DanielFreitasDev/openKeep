import { zUserSettings, zUserSettingsPatch } from '@openkeep/shared';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import type { Realtime } from '../../realtime/registry.js';
import { getSettings, updateSettings } from './service.js';

export function registerSettingsRoutes(app: App, db: Db, realtime: Realtime): void {
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
