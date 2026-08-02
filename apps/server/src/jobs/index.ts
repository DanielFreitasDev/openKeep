import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { PgBoss } from 'pg-boss';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { userJobs } from '../db/schema/jobs.js';
import type { Metrics } from '../lib/metrics.js';
import { trackJob } from '../lib/metrics.js';
import type { Storage } from '../lib/storage.js';
import type { QuotaOpts } from '../modules/attachments/service.js';
import { runScheduledBackup } from '../modules/backup/service.js';
import {
  cleanupExpiredExports,
  cleanupStaleImports,
  reconcileStorage,
  runExport,
  runTakeoutImport,
} from '../modules/import-export/service.js';
import { fetchLinkPreview } from '../modules/link-preview/fetcher.js';
import {
  normalizeUrl,
  pruneExpiredPreviews,
  storeFetched,
} from '../modules/link-preview/service.js';
import { purgeExpiredTrash } from '../modules/notes/service.js';
import { configureWebPush, pushFiredReminders } from '../modules/reminders/push.js';
import { fireDueReminders } from '../modules/reminders/service.js';
import type { DeliveryOptions } from '../modules/webhooks/delivery.js';
import { deliverWebhook } from '../modules/webhooks/delivery.js';
import type { WebhookJob } from '../modules/webhooks/dispatcher.js';
import { buildPayload, findWebhookById, recordAttempt } from '../modules/webhooks/service.js';
import type { Realtime } from '../realtime/registry.js';

interface QueryablePool {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

type Publisher = Pick<Realtime, 'publishToUsers'>;

async function jobRow(db: Db, jobId: string) {
  const [row] = await db
    .select({ userId: userJobs.userId, status: userJobs.status })
    .from(userJobs)
    .where(eq(userJobs.id, jobId))
    .limit(1);
  return row;
}

function publishOutcome(
  realtime: Publisher | undefined,
  userId: string,
  jobId: string,
  kind: 'import' | 'export',
  status: string,
): void {
  if (!realtime) return;
  if (status === 'done') {
    realtime.publishToUsers([userId], { type: 'job.completed', payload: { jobId, kind } });
  } else if (status === 'failed') {
    realtime.publishToUsers([userId], { type: 'job.failed', payload: { jobId, kind } });
  }
}

/** `import-takeout` worker body: run the import, stream job.* events to the owner. */
export async function importTakeoutJob(
  db: Db,
  storage: Storage,
  jobId: string,
  quota: QuotaOpts,
  realtime?: Publisher,
): Promise<void> {
  const job = await jobRow(db, jobId);
  if (!job) return;
  await runTakeoutImport(db, storage, jobId, quota, (done, total) => {
    // The service already throttles this callback (every 5 notes + final).
    realtime?.publishToUsers([job.userId], {
      type: 'job.progress',
      payload: { jobId, progress: done, total },
    });
  });
  const after = await jobRow(db, jobId);
  if (after) publishOutcome(realtime, after.userId, jobId, 'import', after.status);
}

/** `export-user-data` worker body. */
export async function exportUserDataJob(
  db: Db,
  storage: Storage,
  jobId: string,
  realtime?: Publisher,
): Promise<void> {
  await runExport(db, storage, jobId);
  const after = await jobRow(db, jobId);
  if (after) publishOutcome(realtime, after.userId, jobId, 'export', after.status);
}

/** `link-preview-fetch` worker body: fetch, store, then nudge the requester. */
export async function linkPreviewFetchJob(
  db: Db,
  data: { url: string; requestedBy?: string },
  realtime?: Publisher,
): Promise<void> {
  const normalized = normalizeUrl(data.url);
  const result = await fetchLinkPreview(normalized).catch(() => ({ ok: false as const }));
  await storeFetched(db, normalized, result);
  if (data.requestedBy) {
    // The requester's chips poll while pending — this makes resolution instant.
    realtime?.publishToUsers([data.requestedBy], {
      type: 'link_preview.resolved',
      payload: { url: data.url },
    });
  }
}

/**
 * `webhook-deliver` worker body: one POST, then record what came back.
 *
 * A failure is rethrown so pg-boss retries it with backoff, and the endpoint
 * is re-read on every attempt — an endpoint deleted or switched off between
 * the event and the delivery simply stops delivering, which is what "off"
 * should mean to somebody who just clicked it.
 */
export async function webhookDeliverJob(
  db: Db,
  data: WebhookJob,
  opts: DeliveryOptions,
): Promise<void> {
  const webhook = await findWebhookById(db, data.webhookId);
  if (!webhook?.enabled) return;
  const payload = await buildPayload(db, data.userId, data);
  const outcome = await deliverWebhook({ url: webhook.url, secret: webhook.secret }, payload, opts);
  await recordAttempt(db, webhook.id, outcome);
  if (!outcome.ok) throw new Error(outcome.error ?? 'webhook delivery failed');
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
  metrics?: Metrics,
): Promise<PgBoss> {
  /** Every worker body runs through here, so a queue is never counted twice. */
  const work = <T>(queue: string, body: () => Promise<T>) => trackJob(metrics, queue, body);
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
  await boss.work('purge-trash', async () =>
    work('purge-trash', async () => {
      const purged = await purgeExpiredTrash(db, new Date(), storage, config.TRASH_RETENTION_DAYS);
      if (purged > 0) log.info({ purged }, 'purged expired trash');
    }),
  );

  const pushEnabled = configureWebPush(config);
  await boss.createQueue('fire-reminders');
  await boss.schedule('fire-reminders', '* * * * *');
  await boss.work('fire-reminders', async () =>
    work('fire-reminders', async () => {
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
    }),
  );

  // Retries are the feature here: a receiver that is down for a minute must
  // not cost the event. Five tries over an exponential backoff capped at an
  // hour, and a delivery that cannot finish in a minute is a dead endpoint.
  await boss.createQueue('webhook-deliver', {
    retryLimit: 5,
    retryDelay: 10,
    retryBackoff: true,
    retryDelayMax: 3600,
    expireInSeconds: 60,
  });
  await boss.work<WebhookJob>('webhook-deliver', async ([job]) => {
    if (!job) return;
    await work('webhook-deliver', () =>
      webhookDeliverJob(db, job.data, {
        allowPrivateTargets: config.WEBHOOK_ALLOW_PRIVATE_TARGETS,
      }),
    );
  });

  await boss.createQueue('link-preview-fetch');
  await boss.work<{ url: string; requestedBy?: string }>('link-preview-fetch', async ([job]) => {
    if (!job) return;
    await work('link-preview-fetch', () => linkPreviewFetchJob(db, job.data, realtime));
  });

  if (storage) {
    await boss.createQueue('import-takeout');
    await boss.work<{ jobId: string }>('import-takeout', async ([job]) => {
      if (!job) return;
      await work('import-takeout', () =>
        importTakeoutJob(
          db,
          storage,
          job.data.jobId,
          { quotaBytes: config.storageQuotaBytes },
          realtime,
        ),
      );
    });

    await boss.createQueue('export-user-data');
    await boss.work<{ jobId: string }>('export-user-data', async ([job]) => {
      if (!job) return;
      await work('export-user-data', () =>
        exportUserDataJob(db, storage, job.data.jobId, realtime),
      );
    });

    if (config.BACKUP_CRON) {
      await boss.createQueue('scheduled-backup');
      await boss.schedule('scheduled-backup', config.BACKUP_CRON);
      await boss.work('scheduled-backup', async () =>
        work('scheduled-backup', async () => {
          const result = await runScheduledBackup(db, storage, {
            dir: config.backupDirAbs,
            keep: config.BACKUP_KEEP,
          });
          const level = result.failed > 0 ? 'warn' : 'info';
          log[level]({ ...result, dir: config.backupDirAbs }, 'scheduled backup');
        }),
      );
    }

    await boss.createQueue('cleanup-storage');
    await boss.schedule('cleanup-storage', '30 3 * * *');
    await boss.work('cleanup-storage', async () =>
      work('cleanup-storage', async () => {
        const exportsRemoved = await cleanupExpiredExports(db, storage);
        const staleImports = await cleanupStaleImports(db, storage);
        const previewsRemoved = await pruneExpiredPreviews(db);
        const orphansRemoved = await reconcileStorage(db, storage);
        if (exportsRemoved + staleImports + previewsRemoved + orphansRemoved > 0) {
          log.info(
            { exportsRemoved, staleImports, previewsRemoved, orphansRemoved },
            'storage cleanup',
          );
        }
      }),
    );
  }

  return boss;
}
