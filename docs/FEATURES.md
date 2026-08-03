# OpenKeep Feature Catalog

The v1.0 scope: full parity with the Google Keep **web** app as researched in July 2026. Items marked *(divergence)* are deliberate differences, explained in [DECISIONS.md](DECISIONS.md). This file is the research catalog — what Keep does and what we target; a handful of items marked *(deferred in v1.0)* shipped later than the rest and are tracked in [PARITY.md](PARITY.md) under "Known deferrals".

## Notes

- Text notes with rich formatting. v1.0 shipped exactly Keep web's May-2025 set (**H1, H2, normal**, **bold**, *italic*, underline, clear formatting); post-1.0 it widened to what markdown expresses *(divergence)*: H1–H6, ~~strikethrough~~, `inline code`, code blocks, quotes, dividers, bullet/numbered lists, links and tables. Body only; the title is plain text.
- Simple tables *(divergence)*: the formatting bar inserts a 3×3 with a header row and, once the caret is in it, offers the row/column edits; typed or pasted GFM (`| a | b |` over `| --- |`) becomes the same grid. Simple is the contract, not a stage — no merged cells, no column widths, no alignment, because a `|---|` row cannot carry them and every table has to survive the trip to `.md` and back. See DECISIONS #37.
- Markdown is the note's second language *(divergence)*: the syntax formats as you type it, pasted markdown converts, a note downloads as `.md`, and `.md` files (or a zipped vault) import back — see [ROADMAP.md](ROADMAP.md) §3.1 and DECISIONS #26.
- Autosave (debounced; flush on close/navigation — per-field blur flush *deferred in v1.0*). No explicit save button.
- Limits: body 19,999 characters, title ~999 characters.
- "Empty note discarded" when a composer/editor closes with no content.
- Edited timestamp in editor footer, with created-date tooltip on hover.
- Session-scoped Undo/Redo inside the editor (cleared when the editor closes), over the body, the title and the list items — Ctrl+Z / Ctrl+Y or the toolbar buttons. Typing coalesces per field; adding, splitting, checking, indenting, reordering or deleting a row is one step each, and undoing a deleted row puts it back on the server.
- Version history: markdown snapshots per editing session, dated list, download as `.md`; in-place restore keeps the formatting (small enhancement over Keep).
- "Make a copy": copies content, color, labels, images; does **not** copy reminders, collaborators, or pin state.

## Checklists

- Items with checkbox, drag handle, and **one** indent level (`Ctrl+]` / `Ctrl+[` or drag right; the first item can't be indented).
- Enter splits/creates items; "+ List item" placeholder row.
- Checking an item moves it to a collapsible "N Completed items" section (per the "Move checked items to bottom of list" setting), with strikethrough.
- Checking a parent auto-checks its indented run.
- Uncheck all / Delete checked items (menu actions).
- Convert note ↔ list ("Show checkboxes" / "Hide checkboxes", `Ctrl+Shift+8`). List→text drops check state.
- Card summary shows "+ N completed items" under unchecked items.
- ~1,000 items per note.

## Organization

- **Pin**: PINNED / OTHERS uppercase section headers; pinned notes never mix with others.
- **Archive**: hides from main view; searchable; keeps labels and reminders; `e` shortcut.
- **Trash**: 7-day retention banner, read-only notes while trashed, Restore / Delete forever / Empty trash; only the owner deletes for everyone.
- **Templates** *(divergence — Keep has none)*: "Save as template" in the note and card menus moves a note onto a Templates shelf, out of the board, the archive, search, reminders and the `[[` picker; the same menu item moves it back, and the trash still outranks the shelf. "Use template" makes an ordinary copy and opens it — from the composer, the mobile FAB or the template itself. The sidebar row and both entry points appear only once a template exists.
- **Protected notes** *(divergence — Keep has none)*: "Protect note" in the note and card menus hides a note's title, body, checklist and images and takes it out of search, leaving a "Protected note" card that still pins, colours and drags. The words come back for 15 minutes once the session confirms the account password — or an optional 4-to-8-digit PIN set in Settings. Per-user like pin and colour, so protecting a shared note protects only my copy; the note's public link goes dark while it is on. **Hidden, not encrypted**: the server still reads the content, and so does the account's own export. Invisible to API tokens and therefore to the MCP server, which cannot be asked to retype a password.
- Manual drag reorder within sections — per-user, synced across devices (`Shift+J/K` keyboard equivalent).
- Grid ↔ list view toggle (`Ctrl+G`), persisted per user.
- **Colors**: 12 swatches — Default, Coral, Peach, Sand, Mint, Sage, Fog, Storm, Dusk, Blossom, Clay, Chalk — with distinct light and dark palettes (see `packages/shared/src/constants/colors.ts`).
- **Backgrounds**: 9 illustrations (Groceries, Food, Music, Recipes, Notes, Places, Travel, Video, Celebration) — original artwork *(divergence: artwork is ours, themes match)*.
- Color/background are **per-user** on shared notes.

## Labels

- Max 50 per account; created/renamed/deleted in the "Edit labels" modal.
- Sidebar entries sorted alphabetically; label routes (`/label/<name>`).
- Multiple labels per note; chips on cards (with overflow "+N").
- `#` in a note body opens quick-labeling (autocomplete, create-on-the-fly).
- Per-user on shared notes.

## Reminders *(divergence: native, classic Keep UX)*

Real Keep migrated reminders to Google Tasks (Oct 2025). OpenKeep implements the classic behavior:

- Presets: Morning 8:00 / Afternoon 13:00 / Evening 18:00 (times configurable in Settings) + "Pick date & time".
- Recurrence: daily / weekly / monthly / yearly / custom interval (RFC-5545 under the hood).
- Reminders view in the sidebar; reminder chip on cards (click to edit/delete).
- Web Push + in-app notifications; snooze; cross-device dismissal.
- One reminder per (note, user); per-user on shared notes.

## Sharing & collaboration

- Invite by email (registered instance users only; Keep-style "person not found" otherwise).
- Two permission levels 🔀 (Keep has only the first): **Can edit** and **Can view**. View-only freezes the shared content — title, body, checklist items, attachments, note type, version restore — while the viewer keeps their own pin, colour, labels, reminder and board order. The owner changes the level of an existing member at any time and it takes effect live.
- Collaborators can manage the collaborator list; owner delete removes the note for all; a collaborator can leave.
- **Public read-only link** 🔀 (Keep has none): the owner mints one address per note — optionally expiring in 7 or 30 days — and anyone holding it opens `/s/<token>` with no account at all. The page carries only shared content (title, body or checklist, images, drawings, audio); labels, reminders, pin and every member's identity stay behind. Re-issuing replaces the address, revoking deletes it, and a trashed note goes dark until it is restored.
- **Per-user state on shared notes**: pin, archive, color/background, labels, reminders, manual order. Content (title/body/items/images) is shared.
- Near-real-time propagation (~1s) via WebSocket.
- "Enable sharing" setting: off = blocks inbound shares to you.

## Search

- Full-text over title + body + list items; English + Portuguese stemming-free word-prefix matching, accent-insensitive.
- Focusing the search box shows filter tiles: **Types** (Lists, Images, URLs, Audio, Drawings, Reminders), **Labels**, **People** *(deferred in v1.0)*, **Colors** — combinable with text.
- Search operators typed in the box *(divergence — Keep has none)*: `label:`, `color:`, `has:`, `is:pinned|archived`, `before:`/`after:` and `-` to exclude; each one becomes a chip that removes itself from the query.
- Archived notes included, grouped under an "ARCHIVE" section header; trashed excluded.
- Live filtering as you type; "No matching results." empty state; `/` focuses search.

## Images & attachments

- Multiple images per note, stacked above the title; upload validation (magic bytes; ~10 MB, 25 MP caps); server thumbnails; delete on hover.
- Audio attachments: playback, plus in-browser recording *(divergence — Keep records only on Android)* from the editor toolbar, the mobile "Add to note" sheet and the FAB, with a Stop/Discard bar and a 10-minute ceiling per take.
- Any other file *(divergence — Keep carries images and audio only)*: PDF, Word/Excel/PowerPoint (both the OOXML and the legacy formats), OpenDocument, epub, zip and text files, up to 25 MB and 25 attachments per note. Attach from the editor toolbar or the mobile "Add to note" sheet; the note shows a download chip next to the link previews, and files ride along to the public link page and the export archive. The type is decided by the bytes (the extension only names which format inside the container), and downloads are always downloads — nothing is rendered on the app's own origin.

## Drawings

- Full-screen Keep-style drawing editor: pen / marker / highlighter with Keep's 28-color palette and 8 stroke sizes, whole-stroke eraser (+ Clear page), grid paper (squares / dots / rules), undo/redo, and New drawing / Export as image / Delete current drawing.
- Entry points: composer "New note with drawing", editor menu / mobile add sheet, FAB "Drawing"; tapping a drawing in the editor re-opens it with its strokes (vectors stored server-side next to the PNG render).
- The note shows the render cropped to the ink, Keep-style; an untouched drawing is discarded ("Empty note discarded").
- **Select** tool: loop around strokes to pick them up (it takes only strokes the loop encloses whole), drag to move them, Delete — or the tool's panel — to remove them; Escape lets the selection go.
- **Zoom and pan**: ctrl/⌘ + wheel zooms at the pointer, a bare wheel pans, two fingers pinch, and middle-drag or space-drag grabs the paper. The pill by the canvas shows the level with −/+/Fit to screen (also Ctrl +/-/0); zooming out stops where the whole page is visible.
- **The page grows under the pen** 🔀: ink reaching the bottom edge lengthens the paper, and holding the pen there rolls it up so the stroke keeps going (up to 8192px).
- **Draw on image** 🔀: an image in the editor offers to be drawn on. The drawing takes the photo's shape, the note then shows the annotated version in the photo's place, and the original stays attached so the ink can always be re-edited (delete the drawing and the photo comes back).

## Link previews

- URLs in the body produce a preview chip (favicon, title, domain) at the bottom of card/editor.
- Server fetch is SSRF-safe; the browser loads preview images directly.
- "Display rich link previews" setting.

## Multi-select

- Checkmark appears top-left of cards on hover; marquee (rubber-band) selection with the mouse (either button, add-only — a plain background click clears); `Ctrl+A` selects all in view; `x` toggles the focused card.
- Selection top bar: "N selected" + Pin, Remind, Color, Archive, More (Delete, Change labels, Collaborator, Make a copy). Esc exits. A label only some of the selection carries shows an indeterminate box; clicking it applies the label to all. Below `md` the Remind icon moves into the More menu (six 48px targets do not fit a 360px phone).
- Bulk Collaborator invites one person to every selected note I own — Keep has no bulk form of it.

## Keyboard shortcuts

Complete Keep map (see `packages/shared/src/constants/shortcuts.ts`), with the `?` help dialog: `j/k`, `Shift+J/K`, `c`, `l`, `/`, `Ctrl+A`, `?`, `e`, `#`, `f`, `x`, `Enter`, `Ctrl+G`, `Esc`/`Ctrl+Enter`, `Ctrl+Shift+8`, `Ctrl+]`/`[`, `Ctrl+B/I/U`, and inside a list `n/p` + `Shift+N/P`.

The list-item four need an item that holds focus without typing: `Esc` inside an item steps out of the field onto the item (the next `Esc`, from the item, closes the note as usual), `n/p` walk the selection, `Shift+N/P` move it one slot inside its display group, and `Enter` puts the cursor back in the field.

## Settings

- Add new items to the bottom · Move checked items to bottom of list · Display rich link previews · Enable dark theme · Reminder default times (morning/afternoon/evening) · Enable sharing.
- Protected notes: set / change / remove the unlock PIN (the account password authorizes it) and "Lock now" to close the reveal window early.
- Theme is per device, with "follow system" *(small enhancement)*.

## UI chrome

- Top bar: hamburger, logo, search box, Refresh, list/grid toggle, settings gear (Settings / Enable dark theme / Keyboard shortcuts / Send feedback → GitHub issues), account menu.
- Sidebar: rail ↔ expanded with Gmail-style hover slide-out; Notes, Reminders, labels, Edit labels, Archive, Trash.
- Composer: "Take a note…" + New list + New note with image; focused on load; click-away saves; "Empty note discarded".
- Editor modal over dimmed backdrop; undo snackbars bottom-left (archive/trash/color/etc. with Undo).
- Dark theme with the distinct muted note-color palette; responsive (drawer sidebar, 1-col grid ≤600px).
- Roboto; Material Symbols icons.

## Auth & account

- Email/password (Better Auth); optional Google/GitHub OAuth via env; sessions; password reset when SMTP configured (hidden otherwise).

## Import / export

- **Google Takeout import**: upload the Keep zip; async job with progress; maps colors/labels/pins/archive/trash; idempotent re-import.
- **Markdown import** *(divergence)*: `.md` files upload directly, or a zipped vault (Obsidian, Joplin, a folder of notes) goes through the same archive job — front matter restores labels/color/pin, a file of `- [ ]` items becomes a checklist, and re-importing an unchanged file is a no-op.
- JSON export of all your data (+ attachment files) as a zip.
- **Print / "Save as PDF"** *(divergence)*: "Print" in the note and card menus prints a purpose-built sheet — title, images, body or checklist, labels and the edited stamp — with the app itself hidden; the browser's own dialog handles paper or PDF, and names the file after the note.

## AI integration (MCP) *(divergence: OpenKeep addition — real Keep has no API)*

- Full [MCP](MCP.md) server: 44 tools covering everything the UI does — notes, checklists, labels, reminders (with recurrence), search, versions, collaborators, image attachments, settings, import/export — plus note resources and two prompts.
- **Personal access tokens** (`okp_…`), managed in Settings → API tokens: shown once, sha256-at-rest, optional expiration, 10 per account, revocable; token management is session-only.
- Two transports: Streamable HTTP mounted at `/api/mcp` (same container) and a stdio binary (`packages/mcp`) for local clients; stdio adds local-file tools (Takeout import, export download).
- AI mutations ride the normal REST layer and fan out over WebSocket — edits appear live in open tabs, attributed to the token's client id.
- **Outgoing webhooks** *(divergence)*, in Settings → Webhooks: up to 5 endpoints per account, each subscribed to any of seven note-level events, delivered as a signed POST (`X-OpenKeep-Signature`, HMAC-SHA256 over timestamp + body) carrying the note itself. Queued with exponential backoff, testable from the dialog, and session-only to manage — this is the hook for n8n, Zapier and Home Assistant.

## Production readiness

- Docker Compose (app + Postgres 18), migrations on boot, seed script, `/api/healthz` + `/api/readyz`, structured logs, rate limiting, security headers/CSP, OpenAPI docs, backup guidance.

## Post-1.0 roadmap

Optional audio transcription · OCR "Grab image text" · "Things" auto-classification · optional LLM "Help me create a list" · native `display: grid-lanes` masonry when cross-browser · full local-first offline.

## Out of scope

Google integrations (Docs/Calendar/side panel/Assistant), Family groups, location reminders (discontinued in Keep itself), native mobile apps, Keep enterprise API compatibility.
