# Architecture

## Deployment shape

One app container serves the API **and** the built SPA (`@fastify/static`) same-origin → CORS is never registered. Security relies on `SameSite=Lax` httpOnly cookies plus `Origin`/`Sec-Fetch-Site` rejection of cross-site mutations. TLS terminates at the user's reverse proxy (Caddy/Traefik — see DEPLOYMENT.md). Compose = app + postgres. One shared `pg` Pool serves Drizzle and pg-boss.

```
browser ── https ── reverse proxy ── app container (Fastify: /api + SPA + WS + pg-boss workers)
                                          │
                                     postgres:18
```

## Data model (PostgreSQL 18 + Drizzle)

Conventions: `text` + CHECK instead of PG enums; native `uuidv7()` PKs; `timestamptz` everywhere; `updated_at` via Drizzle `$onUpdate` (no triggers).

- **Migration 0000 (hand-written)**: `CREATE EXTENSION unaccent` + custom text search config `openkeep` (`unaccent` filter + `simple` dict). The two-arg `to_tsvector('openkeep', …)` stays IMMUTABLE → legal in generated columns; accent-insensitive EN/PT word-prefix search with one GIN index.
- **Better Auth tables** (`user`, `session`, `account`, `verification`): drizzle schema committed; all migrations unified under drizzle-kit (Better Auth's migrator never runs). `databaseHooks.user.create.after` seeds `user_settings`. App tables reference `"user"(id)` as text.
- **`notes`** — shared content: `owner_id`, `type` (`text|list`), `title`, sanitized **`body_html`** (allowlist `h1,h2,p,br,strong,em,u`, zero attributes) + server-derived **`body_text`** (drives FTS and `.txt` export), `has_links`, **`trashed_at`** (owner-scoped soft delete), `last_edited_by`, `imported_fingerprint` (partial unique `(owner_id, fingerprint)` → idempotent re-imports), weighted generated `search_tsv` (title=A, body=B) + GIN.
- **`note_members`** — membership AND per-user state in ONE row (owner has a row too; `role` owner|collaborator): `pinned`, `archived`, `color`, `background`, fractional `position` (`text COLLATE "C"`). PK `(note_id, user_id)`; partial unique index guarantees exactly one owner. The single authz + display-state chokepoint.
- **`note_items`** — per-item rows: `text` (plain), `checked`, `indent` (0|1), fractional `position`, own `search_tsv`. Item-level ops minimize the collab conflict surface.
- **`labels`** (unique `lower(name)` per user; 50 cap enforced in the service transaction) + **`note_labels`** with composite FK → `note_members(note_id, user_id)` ON DELETE CASCADE → leaving a note auto-clears your labels on it.
- **`reminders`** — ONE per (note, user): `remind_at` (= next occurrence, advanced by the fire job), `rrule` (nullable = one-shot) + `dtstart` + IANA `timezone` (DST-correct), `snoozed_until`, `acknowledged_at`, `done`. Partial index on `coalesce(snoozed_until, remind_at) WHERE NOT done`.
- **`note_versions`** — immutable snapshots (title/body_text/items JSONB). Session-boundary capture: before a content mutation iff `notes.updated_at` > 10 min old OR `last_edited_by` differs; also before convert/restore and at import; cap 50/note.
- **`attachments`** (kind image|audio|drawing, storage/thumb keys, mime, size, w/h; display order = created_at), **`link_previews`** (global cache keyed sha256(normalized url), TTL ok+7d/failed+1d; image/favicon stored as URLs — browser loads them), **`user_settings`**, **`push_subscriptions`**, **`user_jobs`** (import/export progress).
- **Ordering**: fractional indexing — single-row writes, no renumbering; tiebreak `(position, id)`.
- **Trash semantics**: memberships persist while trashed (restore returns the note to everyone); content edits on trashed → `409 note_trashed`; editing archived is allowed; purge = hard DELETE + file unlink.
- FullNote assembly = one batched select per table over the note-id set (no N+1).

## API & realtime

- Everything under `/api`, no version prefix (SPA + server ship in lockstep). OpenAPI generated from shared Zod schemas (`fastify-type-provider-zod` + @fastify/swagger); Swagger UI in dev; committed spec drift-checked in CI.
- Errors: RFC 9457 problem details `{type, title, status, code, detail?, errors?, requestId}` with a fixed code catalog (`packages/shared/src/schemas/common.ts`).
- **Auth**: Better Auth fetch handler bridged at `/api/auth/*`; `requireAuth` preHandler decorates `req.user`.
- **AuthZ**: single chokepoint `assertNoteAccess(userId, noteId, 'member'|'owner')` returns the membership row; non-members get 404 (no existence oracle). Matrix: content ops = all members; per-user state/labels/reminder = self; trash/restore/delete/empty/invite = owner; remove collaborator = owner (anyone) or self (leave). Encoded as a parameterized integration-test table.
- **Notes**: `GET /notes?view=active|archived|trash` (FullNotes; no pagination v1 — ceiling documented) · `POST /notes` (client-supplied UUIDv7 ok) · `PATCH /notes/:id` (content LWW) · `PATCH /notes/:id/state` (per-user) · trash/restore/delete/empty · copy · convert.
- **Items**: item-level endpoints (create honors `new_items_at_bottom`; PATCH text/checked/indent/position; uncheck-all; delete-checked). Checking a parent auto-checks its indent-1 run.
- **Search**: `GET /api/search?q&type&label&color&collaborator` — server FTS escape hatch; primary v1 search UX is client-side over the corpus cache.
- **WebSocket `/api/ws`**: session cookie validated on upgrade + Origin check; one logical channel per user (in-process registry behind `publishToUsers()` → LISTEN/NOTIFY drop-in later). Events emitted **after commit**; content events fan out to all members, per-user events to own devices only. Envelope `{type, ts, origin?, payload}`; `origin` echoes `X-Client-Id` so clients drop their own echoes. Ping 30 s.
- **Resync (deliberately simple)**: no oplog/cursor — on reconnect the client invalidates active queries. WS is a best-effort accelerator over an online-first refetch baseline.
- **Conflicts**: field-level LWW via targeted PATCHes; item-level granularity for lists; editor dirty-field guard; no OT/CRDT in v1.
- **Jobs (pg-boss, in-process workers)**: `purge-trash` (hourly) · `fire-reminders` (per-minute; `FOR UPDATE SKIP LOCKED`; recurrence advanced inside the claiming tx → no double fire) · `cleanup-storage` (daily) · `link-preview-fetch` (`singletonKey = url_hash`) · `import-takeout` (streaming yauzl, fingerprint dedupe, color map, throttled progress) · `export-user-data`.

## Server structure

Two layers only (routes → services; Drizzle is the repository). Modules per domain: `notes, items, labels, sharing, reminders, search, attachments, versions, link-preview, settings, push, import-export`; `realtime/` (registry + publish); `plugins/` (auth bridge, helmet, rate limit, multipart, swagger, static SPA, error handler); `lib/` (errors, sanitize, ssrf-guard, plain-text); zod-validated env (`config.ts`, fail-fast); pino with redaction.

## Frontend

- **Routes** (TanStack Router, file-based): `/login` + pathless `_shell` layout (auth guard) containing `/`, `/reminders`, `/archive`, `/trash`, `/label/$labelName`, `/search`. **Editor modal = global `?note=<id>` search param** on any shell route (back closes; deep links work). Settings/Shortcuts/Edit-labels/Share dialogs = Zustand `activeDialog` (not URL — Keep parity).
- **State**: single canonical corpus cache `['notes']` (active+archived+trashed) + pure memoized selectors per view via `useQuery({select})`. Client generates UUIDv7 note ids. **No invalidate-on-success**: HTTP responses merge mutated fields; WS events apply per-field deltas in commit order; own echoes dropped via `X-Client-Id`. **Undo snackbar = inverse mutation** (8 s). Zustand: `uiStore` (viewMode, theme, sidebar, activeDialog, focusedNoteId, snackbar queue) + `selectionStore`.
- **Autosave** (`useNoteAutosave`): per-field dirty map, 500 ms trailing debounce PATCHing only dirty fields; flush on blur/close/Esc/visibilitychange/navigation. Remote patches merge only into non-dirty fields while the editor is open.
- **Masonry**: absolute positioning + `transform` driven by pure `layout(items, cols, cardW, gutter) → rects` (shortest-column-first). Shared ResizeObserver; `useLayoutEffect` before paint; FLIP transitions 180 ms (suspended during drag / reduced-motion). Columns `floor((w+16)/(240+16))`; 1-col fluid ≤600 px; list view = same engine forced 1-col. Images reserve space via stored `{w,h}`. DnD commits one fractional-index reorder. Windowing auto-enables >400 cards/section.
- **Keyboard**: ~150-line scope-stack manager (capture phase; scopes base<grid<editor<dialog; single-char bindings auto-quiet in editables; `packages/shared` shortcut map is the single source for engine + help dialog). Roving tabindex in the grid.
- **Design tokens**: Tailwind 4 `@theme` + `.dark` class variant; 12 note colors ×2 themes as CSS vars; Roboto (self-hosted); Material Symbols per-icon SVG imports; `--card-w:240px --gutter:16px --topbar-h:64px --sidebar-w:280px --rail-w:72px`.
- **i18n**: namespaces per feature; EN + pt-BR bundled eagerly; EN strings mirror Keep verbatim; CI asserts key parity.
- **PWA**: precache app shell + fonts + backgrounds; API GETs NetworkFirst (3 s → cache); attachments CacheFirst 30 d; offline banner; update prompt.

## Testing

- **Unit (no DB)**: sanitizer XSS corpus, SSRF IP table, recurrence DST/month-end suite, fractional indexing, Takeout parser fixtures, tsquery builder, masonry `layout()`, shortcut manager, ChecklistEditor, autosave fake-timers, selectors, i18n key parity.
- **Integration (Testcontainers PG 18)**: one container per run; migrations applied to a template DB; each test file clones it (`CREATE DATABASE … TEMPLATE …`); app driven via `fastify.inject`; two-real-WS-client propagation + per-user isolation tests; job handlers with manipulated clocks; full authz matrix; EN/PT/unaccent search suite.
- **Contract**: route schemas ARE the shared Zod schemas; committed OpenAPI snapshot drift-checked in CI.
- **E2E (Playwright)**: ~16 flows incl. two-browser-context collaboration and PWA offline; `@axe-core/playwright` on key views in both themes (fail on serious+).
