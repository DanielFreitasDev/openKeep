import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Locate the committed drizzle migrations folder from dev (src/) or a bundle (dist/). */
export function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'drizzle'),
    path.resolve(here, '../../drizzle'),
    path.resolve(here, '../drizzle'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'meta', '_journal.json'))) return c;
  }
  throw new Error(`drizzle migrations folder not found (looked in: ${candidates.join(', ')})`);
}

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
}

// Allow `pnpm db:migrate` (tsx src/db/migrate.ts).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { loadDotenv, loadConfig } = await import('../config.js');
  loadDotenv();
  const config = loadConfig();
  await runMigrations(config.DATABASE_URL);
  console.info('migrations applied');
}
