# Verification report — labels service error-helper dedup

**Workspace:** `/home/daniel/desenvolvimento/testes/.openkeep-verify-eval/wt-skip-base`
**Change under review (uncommitted):** `apps/server/src/modules/labels/service.ts` — the two inline
`new AppError(409, 'label_exists', 'Label already exists')` throws in `createLabel` / `renameLabel`
were deduplicated into a `labelExistsError()` helper. Behavior-preserving: same status, code, and
message; `AppError` was already imported as a value. Server-only diff — no web, i18n, route, or
schema changes.

## What was run

| # | Command | Result |
|---|---------|--------|
| 1 | `git status` / `git diff` (review the change) | Only `apps/server/src/modules/labels/service.ts` modified |
| 2 | `docker info` (integration tests need Docker) | Daemon up (29.6.2) |
| 3 | `pnpm check` (Biome + typecheck, all workspaces) | **PASS** — Biome: 278 files, no issues; typecheck green for all 6 packages (served from turbo cache) |
| 4 | `pnpm exec tsc --noEmit` in `apps/server` (cache-bypass re-run, since step 3 was a turbo cache hit) | **PASS** |
| 5 | `pnpm test` (unit + integration, all workspaces) | **PASS** — all 4 test tasks green, but served from turbo's shared worktree cache (FULL TURBO, 12ms) |
| 6 | `pnpm --filter @openkeep/server test` (fresh, cache-bypassing run of the changed package's suite against a throwaway Testcontainers Postgres) | **PASS** — 20 files / 213 tests, including `labels-search.test.ts` (label create/rename/conflict paths) |

## CI-breaker checks called out in CLAUDE.md

- **OpenAPI drift:** no route or schema changed, so no regen needed; `openapi.test.ts` ran in the
  fresh server suite (step 6) and passed — committed `docs/openapi.json` matches.
- **i18n parity:** no EN/pt-BR strings touched; `src/i18n/parity.test.ts` passed in the web test run.

## E2E: intentionally skipped

CLAUDE.md requires `pnpm test:e2e` only "when the web app changed". This diff touches only
`apps/server`, and the API surface is byte-identical (same 409 / `label_exists` / message), so the
Playwright suite was **correctly skipped** — it would also have written to the dev database for no
coverage gain.

## Fixes applied

None needed — every step passed on the first real run. The working tree still contains only the
intended one-file change (verification introduced no formatter rewrites or regenerated files).

**Verdict: ready to commit.**
