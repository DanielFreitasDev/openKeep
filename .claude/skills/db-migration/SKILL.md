---
name: db-migration
description: Create and apply a Drizzle database migration for OpenKeep — schema edit, generate SQL, review, apply to the dev DB. Use whenever the PostgreSQL schema needs to change.
---

Schema change flow (Drizzle Kit, PostgreSQL 18):

1. Edit the schema in `apps/server/src/db/schema/*.ts` (one file per domain, barrel in `index.ts`). Write camelCase in TS — drizzle config maps columns to `snake_case`.
2. Generate: `pnpm --filter @openkeep/server db:generate`. A new numbered `.sql` file lands in `apps/server/drizzle/`.
3. Review the generated SQL before applying — drizzle-kit can emit destructive rewrites (drop/recreate) for renames; hand-edit the SQL if needed. `0000_extensions.sql` is hand-written (creates `unaccent` and the custom `openkeep` text-search config that the FTS generated columns depend on) — never regenerate it.
4. Apply: `pnpm db:migrate` (dev DB must be up: `pnpm db:up`). Migrations also run automatically at server boot, so a running dev server may already have applied it.
5. Run `pnpm --filter @openkeep/server test` — integration tests build a fresh template database from the full migration chain and will catch a broken migration.

Never edit an already-committed migration file — self-hosted installs run migrations at boot, so history must stay append-only. Create a new migration instead.
