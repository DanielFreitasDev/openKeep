# MCP — connect AI assistants to OpenKeep

OpenKeep ships a full [Model Context Protocol](https://modelcontextprotocol.io) server: AI clients (claude.ai, ChatGPT, Claude Code, Claude Desktop, the Claude API, or anything MCP-capable) can do **everything the UI does** — notes, checklists, colors, pin/archive, labels, reminders with recurrence, search, version history, collaborators, image attachments, import/export and settings.

Every mutation goes through the same REST layer as the browser (validation, sanitization, authorization, versioning), and fans out over WebSocket — changes made by an AI appear **live** in your open tabs.

Two credentials reach the server, and which one you need depends on the client:

- **OAuth 2.1** — for hosted apps you cannot hand a secret to (claude.ai, ChatGPT). Nothing to create in advance: point the connector at your instance and sign in. Jump to [claude.ai and ChatGPT](#claudeai-and-chatgpt-custom-connector-oauth).
- **A personal access token** — for clients you configure yourself (Claude Code, Claude Desktop, the APIs). Create one first, below.

## 1. Create an API token

Settings menu (gear icon) → **API tokens** → name it, pick an expiration, **Create**. The `okp_…` secret is shown exactly once — copy it immediately. Treat it like a password: it grants full access to your notes (up to 10 tokens per account; revoke any time in the same dialog). The same dialog lists **Connected apps** — anything authorized over OAuth — and disconnects them.

Skip this step entirely if you are connecting claude.ai or ChatGPT.

## 2. Connect a client

Two transports, same tools:

- **Streamable HTTP** (recommended): the server is already mounted at `https://your-openkeep/api/mcp` — nothing to install.
- **stdio**: a local process (`packages/mcp`, bin `openkeep-mcp`) that talks to your instance over HTTP. Adds two extra tools that touch your local disk (`import_takeout`, `download_export`) and lets `upload_image` read a local `path`.

The HTTP endpoint serves the **2026-07-28** protocol revision (stateless core: no `initialize` handshake, no `Mcp-Session-Id`, `server/discover`, cacheable `tools/list`) and falls back to per-request stateless serving for 2025-era clients, so old and new clients both work. Legacy session operations (`GET`/`DELETE` for the 2025 SSE stream) answer `405` — nothing in the tool surface needs them.

### Claude Code

HTTP:

```sh
claude mcp add --transport http openkeep https://keep.example.com/api/mcp \
  --header "Authorization: Bearer okp_…"
```

stdio (run from a checkout after `pnpm install && pnpm --filter @openkeep/mcp build`):

```sh
claude mcp add openkeep \
  --env OPENKEEP_URL=https://keep.example.com \
  --env OPENKEEP_TOKEN=okp_… \
  -- node /path/to/openkeep/packages/mcp/dist/stdio.js
```

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openkeep": {
      "command": "node",
      "args": ["/path/to/openkeep/packages/mcp/dist/stdio.js"],
      "env": {
        "OPENKEEP_URL": "https://keep.example.com",
        "OPENKEEP_TOKEN": "okp_…"
      }
    }
  }
}
```

### claude.ai and ChatGPT (custom connector, OAuth)

The hosted apps — claude.ai, Claude Desktop, Cowork, ChatGPT in Developer Mode — cannot hold an `okp_` token: ChatGPT accepts only OAuth 2.1 or no auth at all, and Claude's static-header option is a gradual beta. OpenKeep is therefore its **own OAuth 2.1 authorization server**, and both connect the same way:

1. Add a custom connector pointing at `https://keep.example.com/api/mcp` — that is the whole configuration; leave client id and secret blank.
2. The client discovers the authorization server, registers itself, and sends you to OpenKeep to sign in.
3. A consent screen names the app and the hostname it will send you back to. **Allow** finishes the connection.

Nothing to paste, and the grant is per-user: two people on the same instance connect their own accounts.

Where step 1 lives — OpenAI in particular keeps moving it, and renamed connectors to **apps** in December 2025:

- **claude.ai** — **Settings → Connectors → Add custom connector**, leaving Advanced settings (client id/secret) empty. On Team/Enterprise an Owner adds it under **Admin settings → Connectors** and members then hit **Connect**.
- **ChatGPT** — web only, and behind a toggle. Turn on **Settings → Security and login → Developer mode**; accounts that have not been migrated still carry it under **Settings → Connectors → Advanced** or **Settings → Apps → Advanced settings**. Then open the **Apps** page (`chatgpt.com/plugins`), press **+**, and create a developer-mode app with authentication **OAuth**. It lands under **Drafts**; enable it per conversation from **+ → Developer mode**. Developer mode does not require `search`/`fetch` tools — the whole catalog is available, and write actions ask for confirmation by default.

Requirements and caveats:

- The URL must be **public HTTPS**; `localhost` will not resolve from Anthropic's or OpenAI's servers. Tunnel it (Cloudflare Tunnel, ngrok) to try it against a dev instance.
- **Registration is open**, as the discovery flow requires — so the consent screen is shown for *every* authorization, and says plainly that OpenKeep has not verified the app. Read the callback hostname before allowing; that is the part a stranger cannot fake.
- Access tokens last an hour, refresh tokens a week; **Settings → API tokens → Connected apps** lists what is connected and disconnects it. Disconnecting deletes the grant *and* its live tokens, so access stops at once rather than at expiry.
- Protected notes stay invisible over OAuth exactly as they do over a PAT.
- **ChatGPT's Developer mode is not universal**: it needs a paid plan (Pro, Plus, Business, Enterprise or Education) on the web app, and on Business/Enterprise an admin has to enable **Workspace settings → Permissions & roles → Connected data → Developer mode** before members see the toggle at all. Where it is unavailable, the [Responses API](#chatgpt-via-the-responses-api) route below needs none of it.
- Claude's **request headers** beta also works, if your account has it: set `authorization` to `Bearer okp_…` (including the word `Bearer` and the space — Claude sends the value verbatim). That is a shared credential rather than a per-user login, so prefer OAuth.

The endpoints, all discoverable from the two documents at the origin root:

| Document / endpoint | Path |
|---|---|
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Protected resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource` (and `…/api/mcp`) |
| Dynamic client registration (RFC 7591) | `/api/auth/mcp/register` |
| Authorization (PKCE S256 required) | `/api/auth/mcp/authorize` |
| Token | `/api/auth/mcp/token` |

An unauthenticated call to `/api/mcp` answers `401` with `WWW-Authenticate: Bearer … resource_metadata="…"`, which is the handshake that starts all of this.

### ChatGPT via the Responses API

For automation rather than the ChatGPT UI, OpenAI's **Responses API** takes arbitrary headers, so a PAT works with no OAuth round trip:

```json
{
  "model": "gpt-5",
  "tools": [
    {
      "type": "mcp",
      "server_label": "openkeep",
      "server_url": "https://keep.example.com/api/mcp",
      "headers": { "Authorization": "Bearer okp_…" },
      "require_approval": "never"
    }
  ],
  "input": "Crie uma nota fixada cor mint com uma checklist de compras"
}
```

### Claude API (MCP connector)

Pass the endpoint straight to the Messages API (beta header `mcp-client-2025-11-20`). Both blocks are required — `mcp_servers` declares the connection, and an `mcp_toolset` entry in `tools` enables it:

```json
{
  "model": "claude-sonnet-5",
  "max_tokens": 2048,
  "mcp_servers": [
    {
      "type": "url",
      "url": "https://keep.example.com/api/mcp",
      "name": "openkeep",
      "authorization_token": "okp_…"
    }
  ],
  "tools": [{ "type": "mcp_toolset", "mcp_server_name": "openkeep" }],
  "messages": [{ "role": "user", "content": "Crie uma nota fixada cor mint com uma checklist de compras" }]
}
```

### Environment variables (stdio)

| Variable | Meaning |
|---|---|
| `OPENKEEP_URL` | Your instance origin, e.g. `https://keep.example.com` |
| `OPENKEEP_TOKEN` | The `okp_…` secret |
| `OPENKEEP_CLIENT_ID` | Optional stable realtime origin (defaults to `mcp-<hex>` per process) |

The process probes the connection at startup and fails fast on stderr with an actionable message (bad URL, revoked token, server down).

## Tool catalog (59 tools)

| Area | Tools |
|---|---|
| Notes | `list_notes` (`view`: `active`, `archived`, `trash`, `templates`), `get_note`, `create_note` (composite: content + labels + reminder + state in one call), `update_note`, `set_note_state` (incl. `is_template`), `trash_note`, `restore_note`, `delete_note_forever`, `empty_trash`, `copy_note` (a copy is never a template), `convert_note`, `merge_notes` (first id is the target; sources go to the trash), `delete_all_notes` (empties the account, `confirm` literal required) |
| Checklists | `add_checklist_items` (batch), `update_checklist_item`, `delete_checklist_item`, `uncheck_all_items`, `delete_checked_items` |
| Labels | `list_labels`, `create_label`, `rename_label`, `delete_label`, `add_label_to_note` (by name, creates when missing), `remove_label_from_note` |
| Reminders | `set_reminder` (RFC 5545 RRULE + IANA timezone, defaulting to the account setting), `remove_reminder`, `snooze_reminder`, `dismiss_reminder` |
| Calendar feed | `get_calendar_feed`, `rotate_calendar_feed` (mints the `.ics` address, breaking subscribers), `revoke_calendar_feed` |
| Search | `search_notes` (FTS with `headline` match highlighting; `q` accepts the same operators as the app's search box — `label:`, `color:`, `has:`, `is:`, `before:`/`after:`, `-` to exclude) |
| Versions | `list_note_versions`, `get_note_version`, `restore_note_version` |
| Collaborators | `list_collaborators`, `add_collaborator` (`role`: `collaborator` = can edit, `viewer` = read-only), `set_collaborator_role`, `remove_collaborator` |
| Public link | `get_share_link`, `create_share_link` (optional `expires_in_days`; replaces any existing link), `revoke_share_link` |
| Attachments | `upload_image`, `upload_audio`, `upload_file` (any allowed non-media file; `filename` decides the stored name), `get_attachment`, `delete_attachment` |
| Drawings | `get_drawing` (the editable stroke vectors), `create_drawing`, `update_drawing` |
| Links | `get_link_preview` |
| Settings | `get_settings`, `update_settings`, `get_storage_usage` |
| Import/Export | `export_notes`, `get_job`, `import_markdown`, `download_export` ★, `import_takeout` ★ |

★ = stdio-only (needs your local filesystem). The HTTP endpoint advertises 57 tools.

Every upload takes base64 (`data_base64`) over any transport, and a local `path` when the server runs on your own machine over stdio. `import_markdown` mirrors that with `files` (inline text) and `paths`.

### Attachments come back as what they are

`get_attachment` defaults to the thumbnail and falls back to the original when there is none — audio and files carry no thumbnail. What it returns depends on the bytes: images as MCP image content the model can see, audio as audio content, text files as their decoded text, and everything else (PDF, spreadsheet, archive) as an embedded resource blob.

### Drawings from vectors alone

A drawing is stored as stroke vectors plus a rendered picture. `create_drawing` and `update_drawing` take the vectors — flat `[x0, y0, x1, y1, …]` point arrays in a canvas of the given size, with a `pen`, `marker` or `highlighter` tool — and rasterize the PNG themselves, so an agent that has no canvas can still draw. Pass `png_base64` instead when you already have the render; a drawing made over a photo requires it, since its backdrop cannot be reconstructed from strokes. `get_drawing` hands the vectors back in the same shape, so read → edit → write works the way it does for note bodies.

Also exposed: resources `openkeep://notes` (active-note cards) and `openkeep://notes/{id}` (full note JSON), plus two prompts — `capture_note` and `daily_review`.

## Markdown ↔ HTML contract

Tools speak **markdown by default**: a text note's body comes back as `markdown`, and `create_note`/`update_note` accept a `markdown` input. It is the surface to reach for — what comes out goes back in, so read → edit → write keeps the formatting instead of flattening it. An unformatted note reads exactly like plain text, and the older plain `text` input is still accepted (its lines become paragraphs).

HTML appears only on request — `get_note`/`list_notes` accept `include_html`, and `create_note`/`update_note` accept `body_html`. Either way the body is restricted to the sanitized allowlist server-side: `h1`–`h6`, `p`, `br`, `strong`, `em`, `u`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `hr`, `a` (http/https/mailto only), plus `table`/`thead`/`tbody`/`tr`/`th`/`td`. GFM pipe tables round-trip through markdown like everything else — a table read out of a note goes back in unchanged. Anything outside that vocabulary is stripped, so markdown constructs it has no tag for — footnotes, images, task lists — arrive as the literal characters instead of disappearing. Checklist `position` is deliberately absent from the tool surface — ordering is a UI concern.

## Behavior notes

- **`create_note` is composite without rollback**: the note is created first; label/reminder/archive follow-ups that fail return the created note plus `warnings[]` naming the tool that fixes each one.
- **Errors are actionable**: REST problem details map to plain-language guidance (e.g. editing a trashed note → "restore it first with restore_note"; a 401 → regenerate the token in Settings).
- **Rate limits**: `/api/mcp` allows 120 requests/min per IP; the REST routes the tools call have their own limits (e.g. search 60/min, uploads 30/min, import 3/day). `rate_limited` errors surface the wait time.
- **Realtime origin**: mutations carry the client id (`mcp:<tokenId>` on HTTP, `mcp-<hex>` on stdio) as the WS `origin`, so browser tabs reconcile AI edits like any other device's.

## Limitations

- **OAuth grants are all-or-nothing.** The scopes are OIDC's (`openid`, `profile`, `email`, `offline_access`); none of them narrows what a connected app can do, so allowing one is equivalent to handing it a PAT. Read-only connectors would need per-area scopes, which v1 does not have.
- **`ADMIN_EMAILS` surfaces stay closed to OAuth**, like they are to PATs: the admin panel and token management reject both (#19, #32).
- **PATs do not open WebSockets** and cannot access `/api/auth/*` — they authenticate REST + MCP only.
- **PATs cannot manage PATs**: `/api/tokens` requires a browser session (a leaked token cannot mint more tokens).
- **Webhooks have no tools, by design.** `/api/webhooks` is session-only for the same reason token management is: an endpoint that could mint a webhook could quietly forward every note it can read to a URL of its choosing. Set them up in Settings; an agent then benefits from them without being able to point them anywhere.
- **OAuth connections are managed in the browser too** — `/api/oauth/connections` rejects PATs, so a connected app cannot inspect or revoke the grants of another.
- **Protected notes are invisible to MCP.** A note you protect arrives with its title, body, checklist and images empty and never appears in `search_notes`; every tool that would read or write its content answers 423 `note_locked`. Unlocking means retyping the account password or PIN, which a token cannot be asked to do — so the protection holds for agents by construction, not by policy.
- Push subscriptions and fractional drag positions are intentionally absent from the tool surface.

Everything else the REST API exposes to a token has a tool. The gaps above are the ones the API itself closes to tokens, not omissions in the catalog.
