import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../../src/db/migrate.js';

declare module 'vitest' {
  interface ProvidedContext {
    /** Connection string to the container's admin database. */
    adminDbUrl: string;
  }
}

export const TEMPLATE_DB = 'openkeep_template';

/**
 * One Postgres 18 container per test run. Migrations are applied once to a
 * template database; each test file clones it (CREATE DATABASE … TEMPLATE …)
 * for fast, fully isolated schemas.
 */
export default async function globalSetup(project: TestProject) {
  const container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const adminUrl = container.getConnectionUri();

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  await admin.end();

  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  await runMigrations(templateUrl.toString());

  project.provide('adminDbUrl', adminUrl);

  return async () => {
    await container.stop();
  };
}
