# Decisions

Key product and technical decisions, with rationale. Dated 2026-07.

## Product

1. **SPA + separate API in a monorepo** (user-confirmed). One app container serves both same-origin in production.
2. **Online-first with optimistic UI** (user-confirmed). Keep web itself is not a PWA and has no offline mode, so parity does not require offline. The data model stays offline-ready; installable PWA with cached reads ships in v1; mutation queueing shipped post-1.0 (see #22).
3. **i18n from day one** (user-confirmed): English base + full pt-BR. EN strings mirror Keep web verbatim.
4. **Native reminders — deliberate divergence.** Real Keep migrated reminders to Google Tasks (Oct 2025) and no longer sends its own notifications. A standalone clone has no Tasks, so we implement the *classic* Keep reminder UX: presets (Morning 8:00 / Afternoon 13:00 / Evening 18:00, configurable), custom date/time, recurrence, a Reminders view, and Web Push.
5. **Original artwork.** The 9 background illustrations are original work on the same themes; no Google assets anywhere. README carries a non-affiliation disclaimer. Working name "OpenKeep" avoids Google branding.
6. **JS masonry.** Native CSS masonry (`display: grid-lanes`) is Safari-only as of Jul 2026, so the grid uses a JS layout engine (absolute positioning + transforms). `grid-lanes` is a future progressive enhancement.
7. **Takeout importer in v1** — the killer adoption feature; the Takeout Keep JSON schema is documented and stable.

## Architecture

8. **Same-origin serving, no CORS.** The API and built SPA share one origin; cookies are `SameSite=Lax`; cross-site mutations are rejected via `Origin`/`Sec-Fetch-Site` checks. CORS is never registered.
9. **Per-user state lives on the membership row** (`note_members`): pin, archive, color, background, order — plus per-user labels and reminders. Shared content lives on `notes`/`note_items`. This is the single authz and display-state chokepoint.
10. **Field-level LWW, no OT/CRDT in v1.** Targeted PATCHes per field; item-level endpoints minimize the conflict surface for lists; the editor merges remote patches only into non-dirty fields. Documented limitation.
11. **Simple resync.** No oplog/cursor: on WS reconnect the client refetches active queries. WS is a best-effort accelerator over an online-first refetch baseline.
12. **Fractional ordering** (`fractional-indexing`): every move is a single-row write; tiebreak (position, id); stored `text COLLATE "C"`.
13. **uuidv7 primary keys** (native in PG 18); the client generates note ids so `?note=` URLs are stable instantly.
14. **`text` + CHECK instead of PG enums**; `timestamptz` everywhere; `updated_at` via Drizzle `$onUpdate` (no triggers).
15. **FTS**: custom text search config `openkeep` = `unaccent` filter + `simple` dict → accent-insensitive EN/PT word-prefix search with one GIN index, IMMUTABLE and legal in generated columns.
16. **Search UX is client-side** over the full corpus cache (instant, like Keep); the server FTS endpoint is the large-account/API escape hatch.
17. **In-process realtime registry** (`Map<userId, Set<socket>>`) behind a `publishToUsers()` abstraction → Postgres LISTEN/NOTIFY drop-in if multi-instance is ever needed.
18. **Undo snackbar = inverse mutation**, not cache rollback — survives server confirmation and other devices.
19. **Personal access tokens hand-rolled** (2026-07-28). Better Auth stays core-only (its API-key plugin is out per the plugin-CVE stance, #4 below), so PATs are a ~100-line module: `okp_` + 256-bit base64url secret, **sha256 at rest**, lookup by unique index on the hash (random 256-bit secrets make timing-safe comparison unnecessary), throttled `last_used_at`, optional expiry, 10/account. Bearer branch lives inside the existing `requireAuth`; token management endpoints reject PAT auth (a leaked token cannot mint tokens).
20. **MCP is an in-process client of our own REST** (2026-07-28). Tools never touch the DB: stdio talks HTTP with the PAT; the mounted `/api/mcp` builds an `OpenKeepClient` over `app.inject` carrying the request's PAT + `x-client-id: mcp:<tokenId>`. Validation, sanitize, authz-404, versioning and the WS fan-out therefore apply to AI traffic identically to browsers — and AI edits appear live in open tabs. The PAT is re-verified on every MCP request, so revocation is immediate.
21. **MCP SDK v2 mounting via `createMcpHandler` + web-fetch bridge** (2026-07-28). The `@modelcontextprotocol/fastify` adapter creates its *own* Fastify app (DNS-rebinding wrapper) rather than mounting into an existing one, so we bridge the SDK's web-standard handler onto our route ourselves: PAT gate → `handler.fetch(Request, {authInfo, parsedBody})` → stream the Response back. Host/Origin protection stays with the global cross-site guard (adapter-style host validation would break `trustProxy` deployments). SDK packages are spec-day releases pinned exact and excluded from `minimumReleaseAge`.

22. **Offline writes = outbox + draft mirror + visibility, not a sync engine** (2026-07-29). Three independent layers close the "wrote offline, reloaded, lost it" hole: (a) `create`/`patchContent`/`patchState` are keyed mutations whose lifecycle lives in `setMutationDefaults`, so a write paused while offline dehydrates to an IndexedDB outbox (persist-client; queries are NOT persisted — offline reads stay on the SW cache) and resumes after a reload; (b) a best-effort localStorage draft mirror (per-field timestamps, cleared on server ack, 7-day expiry) guarantees the content itself survives whatever the outbox can't — an errored-out mutation, a reload inside the persister's throttle — painted over the cached corpus at boot and re-sent once online; (c) an offline banner, failure toasts with Retry and a beforeunload guard replace silent failure. Replay semantics are the same field-level LWW as live edits (#10), with a wider window — accepted and documented. A replayed create dedupes via its client-generated id (409 conflict = already delivered). Checklist item CRUD keeps its per-item endpoints and rides the draft mirror only; composer images stay in-memory (see PARITY).

23. **Phones mirror the Keep *Android app*, not shrunken Keep web** (2026-07-29). Below `md` (768px) the shell swaps to the Keep-app layout, all CSS-breakpoint-driven so one DOM serves both: a single search-pill top bar (hamburger + hint + view toggle + avatar; the pill becomes the live input on `/search`), a fixed 2-up grid with a tighter gutter, a full-height drawer with a Settings entry (the mobile bar has no gear/refresh), an expandable create FAB (Image/List/Text) replacing the composer, and a full-screen editor — back arrow + pin/remind/archive up top, add/palette/format/⋮ bottom bar, menus as bottom sheets. Card hover toolbars disappear on phones; long-press (touch pointer, movement-cancelled) takes over selection. The FAB pre-creates the note (client id, outbox create) and opens it with `?new=true`; closing an untouched new note discards it Keep-style — trash→delete with bounded retries because delete-forever requires the trash hop and the create may not have landed, and the unmount-cleanup discard only fires when the URL no longer references the note (a cleanup while it still does is a StrictMode remount, not a close). A note born from a picked image never carries `new=true`, so the discard can't race the upload.

## Stack (verified against registries 2026-07-27)

| Choice | Rationale |
|---|---|
| Node 24 LTS, pnpm 11, Turborepo 2.10 | Active LTS to Apr 2028; standard JS monorepo tooling |
| TypeScript 7.0 | Go-native compiler, 10× builds, GA Jul 2026; strict mode |
| Biome 2.5 | Single fast lint+format tool; no coupling to TS compiler internals (safer with TS 7 than typescript-eslint) |
| React 19.2 + Vite 8 + React Compiler v1 | Compiler stable via @vitejs/plugin-react 6; Vite 8 = Rolldown default |
| TanStack Router + Query, Zustand | Type-safe routing; server-state with optimistic updates + WS cache patching; tiny UI-state store |
| Tailwind CSS 4.3 | CSS-first config; design tokens as CSS vars |
| Base UI 1.6 | A11y primitives; successor momentum over Radix (shadcn default since Jul 2026) |
| TipTap 3 | Standard ProseMirror wrapper; minimal extension set matching Keep exactly |
| Atlassian pragmatic-drag-and-drop | Actively maintained (dnd-kit stale since Dec 2024) |
| Fastify 5 + fastify-type-provider-zod | Plugin ecosystem; OpenAPI generated from shared Zod schemas |
| Drizzle ORM 0.45 stable line | Typed SQL-first; kit 1.0 GA migration absorbed later in one PR |
| PostgreSQL 18 | FTS, JSONB, native uuidv7() |
| Better Auth 1.6 **pinned, core only** | Mainstream TS auth; plugins avoided due to 2025/26 plugin CVEs; audit gate in CI |
| pg-boss 12 | Postgres-native queue (no Redis): purge, reminders, imports |
| rrule 2.8 (wrapped) | RFC-5545; dormant lib → isolated behind our own module + exhaustive tests |
| Vitest 4, Testcontainers 12, Playwright 1.62 | Real-Postgres integration tests; E2E with axe a11y scans |

## Risks & mitigations

1. **Masonry × DnD × FLIP animations** — isolate the pure layout engine, component-test it; animations are an optional layer.
2. **TS 7 ecosystem edges** — Biome instead of typescript-eslint; can pin TS 6.x per-package if a tool breaks.
3. **Drizzle 1.0-beta churn** — stay on 0.45 stable; absorb GA in one PR.
4. **Better Auth track record** — core only, pinned exact, `pnpm audit` gate, session cookie settings reviewed.
5. **rrule dormancy** — wrapped behind our module; DST/month-end/leap-year unit suite.
6. **Scope size** — strict milestone order; each milestone releasable; parity checklist tracks drift.
