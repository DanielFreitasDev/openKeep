# Verification report — labels list endpoint query param

Repo: `/home/daniel/desenvolvimento/testes/.openkeep-verify-eval/wt-openapi-with`
Change under review: `apps/server/src/modules/labels/routes.ts` — adds optional `includeCounts` boolean query param (`zListLabelsQuery`) to `GET /api/labels`; handler unchanged, nothing consumes it yet.

Verification followed `.claude/skills/verify/SKILL.md` (the repo's /verify gate), steps in order.

## Steps run

### 1. `pnpm check` — PASS

```
cd /home/daniel/desenvolvimento/testes/.openkeep-verify-eval/wt-openapi-with && pnpm check
```

Biome: 278 files checked, no issues. `tsc --noEmit` green in all workspaces (shared, web, mcp, e2e, server). Re-run again after the OpenAPI fix (step 4) — still PASS.

### 2. `pnpm test` — FAIL, then PASS after fix

```
cd /home/daniel/desenvolvimento/testes/.openkeep-verify-eval/wt-openapi-with && pnpm test
```

- First run: **FAIL** — `apps/server/test/integration/openapi.test.ts > openapi contract > matches the committed docs/openapi.json`. The rendered spec contained the new `includeCounts` query parameter for `GET /api/labels`; the committed `docs/openapi.json` did not (exactly the OpenAPI-drift CI-breaker the skill calls out). Everything else passed: 212/213 tests, 19/20 files; web/mcp/shared suites (including the i18n parity test) green.
- Re-run after the fix below: **PASS** — 20 files, 213/213 tests, all 4 workspace test tasks successful.

### 3. Playwright e2e — SKIPPED (correctly, per skill)

`git diff --name-only` shows only `apps/server/src/modules/labels/routes.ts` and `docs/openapi.json` — nothing under `apps/web/`, so the e2e step does not apply.

### 4. CI-breaker: OpenAPI drift — WAS FAILING, FIXED

```
cd /home/daniel/desenvolvimento/testes/.openkeep-verify-eval/wt-openapi-with && UPDATE_OPENAPI=1 pnpm --filter @openkeep/server test -- openapi
```

Regenerated the committed spec. Resulting diff to `docs/openapi.json` is exactly the new parameter on `GET /api/labels` (+10 lines):

```json
"parameters": [
  {
    "schema": { "type": "boolean" },
    "in": "query",
    "name": "includeCounts",
    "required": false
  }
]
```

This file must be committed together with the route change, otherwise CI fails on spec drift.

### 5. CI-breaker: i18n parity — N/A / PASS

No EN locale strings were added or changed. The parity test that runs inside `pnpm test` passed.

## What was fixed

- Regenerated `docs/openapi.json` via `UPDATE_OPENAPI=1 pnpm --filter @openkeep/server test -- openapi` to include the new `includeCounts` query param. No source-code fixes were needed.

## Outcome

All gate steps green. The change is ready to commit, provided the commit includes **both** files:

- `apps/server/src/modules/labels/routes.ts`
- `docs/openapi.json`
