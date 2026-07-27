import type { FastifyBaseLogger } from 'fastify';
import { PgBoss } from 'pg-boss';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { purgeExpiredTrash } from '../modules/notes/service.js';

interface QueryablePool {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}

/**
 * pg-boss over the shared pg Pool. In-process workers; idempotent schedules.
 */
export async function startJobs(
  _config: Config,
  pool: QueryablePool,
  db: Db,
  log: FastifyBaseLogger,
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
    const purged = await purgeExpiredTrash(db);
    if (purged > 0) log.info({ purged }, 'purged expired trash');
  });

  return boss;
}
