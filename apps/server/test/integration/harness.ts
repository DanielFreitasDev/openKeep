import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import type { App, AppDeps } from '../../src/app.js';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import type { Config } from '../../src/config.js';
import type { Db } from '../../src/db/client.js';
import { createDb } from '../../src/db/client.js';
import { Storage } from '../../src/lib/storage.js';
import { testConfig } from '../helpers.js';
import { TEMPLATE_DB } from './global-setup.js';

export interface TestApp {
  app: App;
  db: Db;
  config: Config;
  storage: Storage;
  close: () => Promise<void>;
  /** Sign up a user and return their session cookie header value. */
  signUp: (email: string, name?: string, password?: string) => Promise<string>;
}

/**
 * Extra app deps, built once the db/config exist — how a test stands in for
 * pg-boss (the queue is "run it now", so an assertion can await the effect).
 */
export type DepsFactory = (ctx: { db: Db; config: Config }) => Partial<AppDeps>;

export async function createTestApp(
  envOverrides: Partial<NodeJS.ProcessEnv> = {},
  depsFactory?: DepsFactory,
): Promise<TestApp> {
  const adminDbUrl = inject('adminDbUrl');
  const dbName = `t_${randomUUID().replaceAll('-', '')}`;

  const admin = new pg.Client({ connectionString: adminDbUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB}`);
  await admin.end();

  const dbUrl = new URL(adminDbUrl);
  dbUrl.pathname = `/${dbName}`;

  const config = testConfig({ DATABASE_URL: dbUrl.toString(), ...envOverrides });
  const { pool, db } = createDb(config.DATABASE_URL);
  const auth = createAuth(config, db);
  const storage = new Storage(`${process.env.TMPDIR ?? '/tmp'}/openkeep-test-storage-${dbName}`);
  await storage.init();
  const app = await buildApp(config, {
    db,
    pool,
    auth,
    storage,
    ...(depsFactory ? depsFactory({ db, config }) : {}),
  });

  const signUp = async (email: string, name = 'Test User', password = 'password-123') => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email, password, name },
    });
    if (res.statusCode !== 200) {
      throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
    }
    const cookies = res.cookies.map((c) => `${c.name}=${c.value}`);
    if (cookies.length === 0) throw new Error('sign-up returned no cookies');
    return cookies.join('; ');
  };

  return {
    app,
    db,
    config,
    storage,
    signUp,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
