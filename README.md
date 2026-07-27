# OpenKeep

**An open-source, self-hostable notes app that faithfully reproduces the Google Keep web experience** — appearance, behavior and workflows — with original code and a modern, sustainable architecture.

> OpenKeep is an independent open-source project. It is **not affiliated with, endorsed by, or sponsored by Google**. "Google Keep" is a trademark of Google LLC. All UI artwork in this repository is original.

## Why

Google Keep is beloved and has no credible self-hosted twin. OpenKeep reproduces the Keep **web** app (keep.google.com) as faithfully as practical: masonry grid, pinned/others sections, checklists with indenting, the 12 note colors with distinct dark-theme palettes, labels, archive, 7-day trash, collaboration with per-user pin/color/labels, instant search with filter tiles, keyboard shortcuts, undo snackbars — the whole feel.

Where Google has *removed* features (native reminders moved to Google Tasks in late 2025), OpenKeep deliberately keeps the classic behavior: native date/time reminders with recurrence and web-push notifications.

## Feature highlights (v1.0)

- Text notes with Keep's exact formatting set (H1/H2/normal, bold/italic/underline) and autosave
- Checklists: Enter-splitting, one-level indent, drag reorder, collapsible "Completed items"
- Pin/archive/trash (7-day retention), manual drag ordering, grid/list views
- 12 colors + 9 original background illustrations, light & dark themes
- Labels (50 max), `#` quick-labeling, label routes
- Native reminders: presets, custom date/time, recurrence, web push
- Sharing with per-user pin/archive/color/labels/reminders and ~1s realtime sync
- Full-text search (English + Portuguese, accent-insensitive) with Keep's filter tiles
- Images on notes, link preview chips, version history with `.txt` download
- Multi-select with bulk actions, complete keyboard shortcut map (`?` to view)
- Google Takeout import, JSON export
- Installable PWA with cached reads
- i18n: English and Português (Brasil)

See [`docs/FEATURES.md`](docs/FEATURES.md) for the exhaustive catalog and [`docs/PARITY.md`](docs/PARITY.md) for the side-by-side parity checklist.

## Quick start (development)

Prereqs: [mise](https://mise.jdx.dev), Docker + Compose v2.

```sh
git clone <this repo> && cd openkeep
mise install          # node 24 + pnpm 11 (pinned)
pnpm install
cp .env.example .env  # defaults work for dev; set BETTER_AUTH_SECRET
pnpm dev              # starts Postgres (compose), API :3000, web :5173
```

Open http://localhost:5173.

Useful scripts: `pnpm check` (lint + typecheck) · `pnpm test` (unit + integration) · `pnpm test:e2e` (Playwright) · `pnpm db:migrate` · `pnpm db:seed`.

## Deployment

Docker Compose (app + Postgres 18) behind your TLS reverse proxy (Caddy/Traefik). See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Architecture

SPA (React 19 + Vite) + Fastify API in one monorepo; PostgreSQL 18 (FTS, uuidv7); Drizzle ORM; Better Auth; pg-boss jobs; WebSocket realtime; online-first with optimistic UI. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Roadmap (post-1.0)

Drawings (full Keep tool set), audio recording + optional transcription, OCR "grab image text", auto-classification, optional LLM list assistant, native CSS masonry when cross-browser, full local-first offline.

## License

[MIT](LICENSE) © 2026 OpenKeep contributors
