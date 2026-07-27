# Deployment

> Production compose + Dockerfile land in M9; this page tracks the target shape and will be completed then.

## Shape

```
internet ── your reverse proxy (TLS) ── openkeep app (:3000) ── postgres:18
```

- One app container: API + built SPA served same-origin. No CORS anywhere.
- TLS terminates at your reverse proxy (Caddy/Traefik examples below).
- State: the Postgres volume + the app's `STORAGE_DIR` volume (attachments, export zips). Back up both.

## Reverse proxy examples

Caddy:

```
keep.example.com {
    reverse_proxy openkeep:3000
}
```

Traefik: route the host to service port 3000; WebSockets work out of the box (`/api/ws`).

Set `APP_URL=https://keep.example.com` — cookies are `Secure` when APP_URL is https.

## Health & readiness

- `GET /api/healthz` — process is up.
- `GET /api/readyz` — DB reachable and migrations applied. Use this for orchestration gates.

## Backups

- `pg_dump` the database on a schedule (all durable data except attachment files).
- Rsync/snapshot the `STORAGE_DIR` volume.
- Restore = restore DB + files, start app (migrations are idemptent at boot).

## Sizing

Single-instance by design (in-process realtime registry + pg-boss workers). A small VM (1–2 vCPU, 1–2 GB) is plenty for personal/family use. The realtime layer is isolated behind `publishToUsers()`; Postgres LISTEN/NOTIFY can be dropped in if multi-instance is ever required.
