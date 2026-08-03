# MCP — connect AI assistants to OpenKeep

OpenKeep ships a full [Model Context Protocol](https://modelcontextprotocol.io) server: AI clients (Claude Code, Claude Desktop, the Claude API, or anything MCP-capable) can do **everything the UI does** — notes, checklists, colors, pin/archive, labels, reminders with recurrence, search, version history, collaborators, image attachments, import/export and settings.

Every mutation goes through the same REST layer as the browser (validation, sanitization, authorization, versioning), and fans out over WebSocket — changes made by an AI appear **live** in your open tabs.

## 1. Create an API token

Settings menu (gear icon) → **API tokens** → name it, pick an expiration, **Create**. The `okp_…` secret is shown exactly once — copy it immediately. Treat it like a password: it grants full access to your notes (up to 10 tokens per account; revoke any time in the same dialog).

## 2. Connect a client

Two transports, same tools:

- **Streamable HTTP** (recommended): the server is already mounted at `https://your-openkeep/api/mcp` — nothing to install.
- **stdio**: a local process (`packages/mcp`, bin `openkeep-mcp`) that talks to your instance over HTTP. Adds two extra tools that touch your local disk (`import_takeout`, `download_export`) and lets `upload_image` read a local `path`.

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

## Tool catalog (44 tools)

| Area | Tools |
|---|---|
| Notes | `list_notes` (`view`: `active`, `archived`, `trash`, `templates`), `get_note`, `create_note` (composite: content + labels + reminder + state in one call), `update_note`, `set_note_state` (incl. `is_template`), `trash_note`, `restore_note`, `delete_note_forever`, `empty_trash`, `copy_note` (a copy is never a template), `convert_note` |
| Checklists | `add_checklist_items` (batch), `update_checklist_item`, `delete_checklist_item`, `uncheck_all_items`, `delete_checked_items` |
| Labels | `list_labels`, `create_label`, `rename_label`, `delete_label`, `add_label_to_note` (by name, creates when missing), `remove_label_from_note` |
| Reminders | `set_reminder` (RFC 5545 RRULE + IANA timezone, defaulting to the account setting), `remove_reminder`, `snooze_reminder`, `dismiss_reminder` |
| Search | `search_notes` (FTS with `headline` match highlighting; `q` accepts the same operators as the app's search box — `label:`, `color:`, `has:`, `is:`, `before:`/`after:`, `-` to exclude) |
| Versions | `list_note_versions`, `get_note_version`, `restore_note_version` |
| Collaborators | `list_collaborators`, `add_collaborator` (`role`: `collaborator` = can edit, `viewer` = read-only), `set_collaborator_role`, `remove_collaborator` |
| Attachments | `upload_image` (base64; local `path` on stdio), `get_attachment` (returns MCP image content; thumbnail by default), `delete_attachment` |
| Links | `get_link_preview` |
| Settings | `get_settings`, `update_settings` |
| Import/Export | `export_notes`, `get_job`, `download_export` ★, `import_takeout` ★ |

★ = stdio-only (needs your local filesystem). The HTTP endpoint advertises 42 tools.

Also exposed: resources `openkeep://notes` (active-note cards) and `openkeep://notes/{id}` (full note JSON), plus two prompts — `capture_note` and `daily_review`.

## Markdown ↔ HTML contract

Tools speak **markdown by default**: a text note's body comes back as `markdown`, and `create_note`/`update_note` accept a `markdown` input. It is the surface to reach for — what comes out goes back in, so read → edit → write keeps the formatting instead of flattening it. An unformatted note reads exactly like plain text, and the older plain `text` input is still accepted (its lines become paragraphs).

HTML appears only on request — `get_note`/`list_notes` accept `include_html`, and `create_note`/`update_note` accept `body_html`. Either way the body is restricted to the sanitized allowlist server-side: `h1`–`h6`, `p`, `br`, `strong`, `em`, `u`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, `hr`, `a` (http/https/mailto only). Anything else is stripped, so markdown constructs outside that vocabulary — tables, footnotes, images — arrive as the literal characters instead of disappearing. Checklist `position` is deliberately absent from the tool surface — ordering is a UI concern.

## Behavior notes

- **`create_note` is composite without rollback**: the note is created first; label/reminder/archive follow-ups that fail return the created note plus `warnings[]` naming the tool that fixes each one.
- **Errors are actionable**: REST problem details map to plain-language guidance (e.g. editing a trashed note → "restore it first with restore_note"; a 401 → regenerate the token in Settings).
- **Rate limits**: `/api/mcp` allows 120 requests/min per IP; the REST routes the tools call have their own limits (e.g. search 60/min, uploads 30/min, import 3/day). `rate_limited` errors surface the wait time.
- **Realtime origin**: mutations carry the client id (`mcp:<tokenId>` on HTTP, `mcp-<hex>` on stdio) as the WS `origin`, so browser tabs reconcile AI edits like any other device's.

## Limitations

- **claude.ai custom connectors need OAuth** — OpenKeep v1 authenticates MCP with PATs only, so the hosted claude.ai "custom connector" flow is not supported. Use Claude Code, Claude Desktop or the API connector above.
- **PATs do not open WebSockets** and cannot access `/api/auth/*` — they authenticate REST + MCP only.
- **PATs cannot manage PATs**: `/api/tokens` requires a browser session (a leaked token cannot mint more tokens).
- **Protected notes are invisible to MCP.** A note you protect arrives with its title, body, checklist and images empty and never appears in `search_notes`; every tool that would read or write its content answers 423 `note_locked`. Unlocking means retyping the account password or PIN, which a token cannot be asked to do — so the protection holds for agents by construction, not by policy.
- Push subscriptions and fractional drag positions are intentionally absent from the tool surface.
