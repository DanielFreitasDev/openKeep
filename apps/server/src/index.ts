import type { PgBoss } from 'pg-boss';
import { buildApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { loadConfig, loadDotenv } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { startJobs } from './jobs/index.js';
import { Storage } from './lib/storage.js';
import type { EnqueueWebhook } from './modules/webhooks/dispatcher.js';
import { Realtime } from './realtime/registry.js';

loadDotenv();

const config = loadConfig();

await runMigrations(config.DATABASE_URL);

const { pool, db } = createDb(config.DATABASE_URL);
const auth = createAuth(config, db);
const storage = new Storage(config.storageDirAbs);
await storage.init();

let enqueueLinkPreview: (url: string, requestedBy: string) => Promise<void> = async () => {};
let enqueueJob: (queue: 'import-takeout' | 'export-user-data', jobId: string) => Promise<void> =
  async () => {};
let enqueueWebhook: EnqueueWebhook = async () => {};
const realtime = new Realtime();
const app = await buildApp(config, {
  db,
  pool,
  auth,
  storage,
  realtime,
  enqueueLinkPreview: (url, requestedBy) => enqueueLinkPreview(url, requestedBy),
  enqueueJob: (queue, jobId) => enqueueJob(queue, jobId),
  enqueueWebhook: (job) => enqueueWebhook(job),
});

let boss: PgBoss | undefined;
let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  await boss?.stop({ graceful: false });
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  boss = await startJobs(config, pool, db, app.log, storage, realtime, app.metrics);
  enqueueLinkPreview = async (url, requestedBy) => {
    const { urlHashOf, normalizeUrl } = await import('./modules/link-preview/service.js');
    await boss?.send(
      'link-preview-fetch',
      { url, requestedBy },
      { singletonKey: urlHashOf(normalizeUrl(url)) },
    );
  };
  enqueueJob = async (queue, jobId) => {
    await boss?.send(queue, { jobId }, { singletonKey: jobId });
  };
  enqueueWebhook = async (job) => {
    await boss?.send('webhook-deliver', job);
  };
  app.log.info(`OpenKeep API ready on :${config.PORT} (${config.NODE_ENV})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
