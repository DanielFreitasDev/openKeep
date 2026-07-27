# Deployment

OpenKeep ships as **one app container** (API + built SPA served same-origin — CORS is never used) plus **PostgreSQL 18**.

## Quick start (Docker Compose)

```sh
git clone <repo> openkeep && cd openkeep
cat > .env <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 16)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
APP_URL=https://keep.example.com
ENV
docker compose -f docker/compose.prod.yml --env-file .env up -d --build
```

The app listens on `127.0.0.1:3000`. Put your TLS reverse proxy in front:

**Caddy**
```
keep.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**Traefik / nginx**: route the host to port 3000; WebSockets (`/api/ws`) work with standard upgrade passthrough.

Set `APP_URL` to the exact public origin — cookies are `Secure` when it is https, and the `Origin` check enforces it.

## Optional features (env)

| Variable | Enables |
|---|---|
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | OAuth sign-in buttons |
| `SMTP_URL`, `SMTP_FROM` | Password-reset emails |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web-push reminders (`pnpm --filter @openkeep/server gen:vapid`) |

## Operations

- **Migrations** run automatically at boot (also: `pnpm db:migrate`).
- **Health**: `GET /api/healthz` (process) and `GET /api/readyz` (DB) — the compose file wires the healthcheck.
- **Jobs** (in-process pg-boss): reminder firing (per-minute), trash purge (hourly), storage cleanup (daily), link-preview fetches, imports/exports.
- **Backups**: `pg_dump` the database + snapshot the `openkeep-storage` volume (attachments, pending exports). Restore both, start the app.
- **Logs**: structured JSON on stdout (pino). Note content never appears above debug level.

## Security posture

- Strict CSP on the SPA (`default-src 'self'`; images additionally `https:` for link-preview thumbnails the *browser* loads).
- Same-origin only: no CORS, `SameSite=Lax` httpOnly cookies, `Origin`/`Sec-Fetch-Site` checks on mutations, session validated on WS upgrade.
- Uploads: magic-byte sniffing (no SVG), sharp re-encode strips EXIF, 10 MB / 25 MP caps, opaque UUID storage keys, `nosniff`.
- Link previews: DNS pre-resolution with pinned-IP connections (rebinding-safe), private/reserved ranges rejected, ≤3 re-validated redirects, 10 s / 2 MB caps.
- Rate limits: auth 10/min/IP, uploads 30/min, search 60/min, imports 3/day.
- Container: non-root user, read-only rootfs (writable `/data` volume + `/tmp` tmpfs).

## Troubleshooting

- **Builds fail with `ECONNREFUSED 127.0.0.1:3128` (or similar proxy errors)**: your Docker client config (`~/.docker/config.json` → `proxies`) points builds at a proxy bound to the host's loopback, which containers can't reach on the default bridge network. The compose file already builds with `network: host` so the loopback proxy works; for plain builds use `docker build --network=host …`.
- The same client config also injects `HTTP_PROXY`/`HTTPS_PROXY` env into **running** containers (check with `docker exec <app> env | grep -i proxy`). OpenKeep is unaffected — its healthcheck and outbound fetches ignore proxy env — but keep it in mind for tools you run inside the container.

## Scaling notes

Single-instance by design (in-process realtime registry + job workers) — right-sized for personal/family/team instances. The realtime layer sits behind one `publishToUsers()` seam; a Postgres LISTEN/NOTIFY transport can be dropped in if multi-instance is ever needed.
