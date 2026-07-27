import { zLinkPreview } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { userSettings } from '../../db/schema/settings.js';
import { getOrQueue } from './service.js';

const zQuery = z.object({ url: z.url().max(2000) });

/** Fetches happen in the pg-boss worker; this endpoint is cache + enqueue. */
export function registerLinkPreviewRoutes(
  app: App,
  db: Db,
  enqueueFetch: (url: string) => Promise<void>,
): void {
  app.get(
    '/api/link-previews',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      schema: { tags: ['link-previews'], querystring: zQuery, response: { 200: zLinkPreview } },
    },
    async (req) => {
      const [settings] = await db
        .select({ enabled: userSettings.richLinkPreviews })
        .from(userSettings)
        .where(eq(userSettings.userId, req.user.id));
      if (settings && !settings.enabled) {
        return {
          url: req.query.url,
          status: 'disabled' as const,
          title: null,
          description: null,
          siteName: null,
          faviconUrl: null,
          imageUrl: null,
        };
      }

      const { preview, enqueue } = await getOrQueue(db, req.query.url);
      if (enqueue) await enqueueFetch(enqueue);
      return preview;
    },
  );
}
