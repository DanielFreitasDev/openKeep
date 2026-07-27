import { buildApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { loadConfig, loadDotenv } from './config.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';

loadDotenv();

const config = loadConfig();

await runMigrations(config.DATABASE_URL);

const { pool, db } = createDb(config.DATABASE_URL);
const auth = createAuth(config, db);
const app = await buildApp(config, { db, pool, auth });

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`OpenKeep API ready on :${config.PORT} (${config.NODE_ENV})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
