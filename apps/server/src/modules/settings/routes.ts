import { zUserSettings, zUserSettingsPatch } from '@openkeep/shared';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { getSettings, updateSettings } from './service.js';

export function registerSettingsRoutes(app: App, db: Db): void {
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
    async (req) => updateSettings(db, req.user.id, req.body),
  );
}
