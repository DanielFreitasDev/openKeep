import type { FastifyBaseLogger } from 'fastify';
import { PgBoss } from 'pg-boss';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import type { Storage } from '../lib/storage.js';
import { fetchLinkPreview } from '../modules/link-preview/fetcher.js';
import { normalizeUrl, storeFetched } from '../modules/link-preview/service.js';
import { purgeExpiredTrash } from '../modules/notes/service.js';
import { configureWebPush, pushFiredReminders } from '../modules/reminders/push.js';
import { fireDueReminders } from '../modules/reminders/service.js';
import type { Realtime } from '../realtime/registry.js';

interface QueryablePool {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

/**
 * pg-boss over the shared pg Pool. In-process workers; idempotent schedules.
 */
export async function startJobs(
  config: Config,
  pool: QueryablePool,
  db: Db,
  log: FastifyBaseLogger,
  storage?: Storage,
  realtime?: Realtime,
): Promise<PgBoss> {
  const boss = new PgBoss({
    db: {
      executeSql: (text, values) =>
        pool.query(text, values) as Promise<{ rows: unknown[]; rowCount: number }>,
    },
  });
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'));

  await boss.start();

  await boss.createQueue('purge-trash');
  await boss.schedule('purge-trash', '0 * * * *');
  await boss.work('purge-trash', async () => {
    const purged = await purgeExpiredTrash(db, new Date(), storage);
    if (purged > 0) log.info({ purged }, 'purged expired trash');
  });

  const pushEnabled = configureWebPush(config);
  await boss.createQueue('fire-reminders');
  await boss.schedule('fire-reminders', '* * * * *');
  await boss.work('fire-reminders', async () => {
    const fired = await fireDueReminders(db);
    if (fired.length > 0) {
      log.info({ count: fired.length }, 'reminders fired');
      for (const f of fired) {
        realtime?.publishToUsers([f.userId], {
          type: 'reminder.fired',
          payload: { noteId: f.noteId, title: f.noteTitle, remindAt: f.remindAt.toISOString() },
        });
      }
      if (pushEnabled) await pushFiredReminders(db, fired);
    }
  });

  await boss.createQueue('link-preview-fetch');
  await boss.work<{ url: string }>('link-preview-fetch', async ([job]) => {
    if (!job) return;
    const normalized = normalizeUrl(job.data.url);
    const result = await fetchLinkPreview(normalized).catch(() => ({ ok: false as const }));
    await storeFetched(db, normalized, result);
  });

  return boss;
}
