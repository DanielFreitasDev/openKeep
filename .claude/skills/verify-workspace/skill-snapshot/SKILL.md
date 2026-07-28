---
name: verify
description: Run OpenKeep's full local verification gate — Biome + typecheck, unit/integration tests, Playwright e2e when web files changed, plus the two easy-to-forget CI-breakers (OpenAPI drift, i18n parity). Use before declaring a change done or committing.
---

Run the verification gate from the repo root, in this order. Stop and fix failures before moving to the next step.

1. `pnpm check` — Biome lint/format plus `tsc --noEmit` in every workspace. Fix style fallout with `pnpm lint:fix`.
2. `pnpm test` — Vitest unit + integration. Integration tests spin up a throwaway Testcontainers Postgres and need a running Docker daemon; they do not touch the dev database.
3. Only if files under `apps/web/` changed (check `git diff --name-only`): `pnpm test:e2e`.
   - Needs the dev DB up and migrated first: `pnpm db:up && pnpm db:migrate`.
   - Needs chromium once: `pnpm --filter @openkeep/e2e exec playwright install chromium`.
   - Runs against the real dev servers and **writes to the dev database** on :55432.

Then check the two CI-breakers that are easy to forget:

- Any server route/schema changed → regenerate `docs/openapi.json` with `UPDATE_OPENAPI=1 pnpm --filter @openkeep/server test -- openapi` and include the diff in the commit.
- Any EN locale string added or changed → mirror it in pt-BR under `apps/web/src/i18n/locales/` (the parity test in `pnpm test` enforces this).

Report pass/fail per step with the failing output. Do not declare the change done while any step is red.
