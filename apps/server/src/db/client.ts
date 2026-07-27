import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = ReturnType<typeof createDb>['db'];

/** One shared Pool for Drizzle and pg-boss. */
export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle({ client: pool, schema, casing: 'snake_case' });
  return { pool, db };
}
