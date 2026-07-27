# OpenKeep Feature Catalog

The v1.0 scope: full parity with the Google Keep **web** app as researched in July 2026. Items marked *(divergence)* are deliberate differences, explained in [DECISIONS.md](DECISIONS.md).

## Notes

- Text notes with limited rich formatting — exactly Keep web's May-2025 set: **H1, H2, normal**, **bold**, *italic*, underline, clear formatting. Body only; the title is plain text.
- Autosave (debounced, flush on blur/close/navigation). No explicit save button.
- Limits: body 19,999 characters, title ~999 characters.
- "Empty note discarded" when a composer/editor closes with no content.
- Edited timestamp in editor footer, with created-date tooltip on hover.
- Session-scoped Undo/Redo inside the editor (cleared when the editor closes).
- Version history: text snapshots per editing session, dated list, download as `.txt`; in-place restore (small enhancement over Keep).
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
- Single permission level: full content edit (no view-only — Keep parity).
- Collaborators can manage the collaborator list; owner delete removes the note for all; a collaborator can leave.
- **Per-user state on shared notes**: pin, archive, color/background, labels, reminders, manual order. Content (title/body/items/images) is shared.
- Near-real-time propagation (~1s) via WebSocket.
- "Enable sharing" setting: off = blocks inbound shares to you.

## Search

- Full-text over title + body + list items; English + Portuguese stemming-free word-prefix matching, accent-insensitive.
- Focusing the search box shows filter tiles: **Types** (Lists, Images, URLs, Audio, Drawings, Reminders), **Labels**, **People**, **Colors** — combinable with text.
- Archived notes included, grouped under an "ARCHIVE" section header; trashed excluded.
- Live filtering as you type; "No matching results." empty state; `/` focuses search.

## Images & attachments

- Multiple images per note, stacked above the title; upload validation (magic bytes; ~10 MB, 25 MP caps); server thumbnails; delete on hover.
- Audio attachments playback (recording is post-1.0).

## Link previews

- URLs in the body produce a preview chip (favicon, title, domain) at the bottom of card/editor.
- Server fetch is SSRF-safe; the browser loads preview images directly.
- "Display rich link previews" setting.

## Multi-select

- Checkmark appears top-left of cards on hover; marquee (rubber-band) selection on the grid; `Ctrl+A` selects all in view; `x` toggles the focused card.
- Selection top bar: "N selected" + Pin, Remind, Color, Archive, More (Delete, Change labels, Make a copy). Esc exits.

## Keyboard shortcuts

Complete Keep map (see `packages/shared/src/constants/shortcuts.ts`), with the `?` help dialog: `j/k`, `Shift+J/K`, `n/p`, `Shift+N/P`, `c`, `l`, `/`, `Ctrl+A`, `?`, `e`, `#`, `f`, `x`, `Enter`, `Ctrl+G`, `Esc`/`Ctrl+Enter`, `Ctrl+Shift+8`, `Ctrl+]`/`[`, `Ctrl+B/I/U`.

## Settings

- Add new items to the bottom · Move checked items to bottom of list · Display rich link previews · Enable dark theme · Reminder default times (morning/afternoon/evening) · Enable sharing.
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
- JSON export of all your data (+ attachment files) as a zip.

## Production readiness

- Docker Compose (app + Postgres 18), migrations on boot, seed script, `/api/healthz` + `/api/readyz`, structured logs, rate limiting, security headers/CSP, OpenAPI docs, backup guidance.

## Post-1.0 roadmap

Drawings (pen/marker/highlighter/eraser/select/grid, draw on image, auto-extending canvas) · audio recording + optional transcription · OCR "Grab image text" · "Things" auto-classification · optional LLM "Help me create a list" · native `display: grid-lanes` masonry when cross-browser · full local-first offline.

## Out of scope

Google integrations (Docs/Calendar/side panel/Assistant), Family groups, location reminders (discontinued in Keep itself), native mobile apps, Keep enterprise API compatibility.
