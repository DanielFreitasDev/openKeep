# Keep Parity Checklist

Side-by-side verification against keep.google.com. Updated at the end of every milestone.

Legend: ✅ verified parity · 🚧 in progress · ⬜ not started · 🔀 deliberate divergence (see DECISIONS.md)

| Area | Keep web behavior | Status | Milestone |
|---|---|---|---|
| Monorepo, CI, dev stack | — (infrastructure) | ✅ | M0 |
| Email/password auth | Google account | ✅ 🔀 self-hosted auth (Better Auth; optional Google/GitHub OAuth) | M1 |
| Top bar (hamburger, logo, search, refresh, view toggle, gear, account) | ✓ | ✅ (search input active in M4; refresh morphs arrow → spinner → cloud-done; focused search lifts to a white sheet) | M1 |
| Sidebar rail ↔ expanded, hover slide-out | ✓ | ✅ (labels added M4) | M1 |
| Dark theme + distinct note-color palette | ✓ | ✅ tokens + toggle + follow-system | M1 |
| Composer ("Take a note…", New list, New note with image) | ✓ | ✅ (list M3, image M5; expand on click/type; click-away saves) | M2 |
| Composer toolbar (collaborator, remind, format, color, image, archive, more, undo/redo) | ✓ | ✅ same row as the editor; reminder/labels/images/collaborators are held as a draft and applied right after the note is created | M2 |
| "Empty note discarded" | ✓ | ✅ snackbar | M2 |
| Masonry grid, PINNED/OTHERS sections | ✓ | ✅ shortest-column flow, 240px cards, FLIP moves | M2 |
| Note card hover toolbar (remind, collaborator, color, image, archive, more) | ✓ | ✅ all six: remind, collaborator, color/background, add image, archive, more (+pin) | M2 |
| 12 colors, light+dark | ✓ | ✅ verified via e2e in both themes | M2 |
| 9 background illustrations | ✓ themes, original art | ✅ 🔀 original line-art, theme-adaptive | M2 |
| Editor modal (formatting bar, Edited tooltip, undo/redo, close) | ✓ | ✅ ?note= deep link; morphs open/closed from its card; Esc/Ctrl+Enter close; undo/redo covers the body (TipTap) plus the title and list items (session snapshot ring, DECISIONS #36) | M2 |
| Rich formatting H1/H2/normal/B/I/U/clear | ✓ (May-2025 set) | ✅ TipTap, server-sanitized allowlist | M2 |
| Markdown as you type and paste | Keep has none | ✅ 🔀 headings 1–6, `**b**`/`*i*`/`~~s~~`/`` `code` ``, ``` fences, `> ` quotes, `---` rules, `- `/`1. ` lists and `[text](url)` links — typed, pasted or imported. `#` still quick-labels everywhere except a line start, where the next character decides | post-1.0 |
| Note formatting vocabulary | H1/H2/B/I/U (May-2025 set) | ✅ 🔀 widened to what markdown expresses: H1–H6, strikethrough, inline code, code blocks, quotes, rules, bullet/ordered lists, links (sanitizer allowlist, DECISIONS #26) | post-1.0 |
| Delete all my notes | Keep has none (Takeout deletion only) | ✅ 🔀 Settings → Danger zone; typed-word confirmation, past the trash. Notes shared with you are left, not deleted; your labels go with your notes | post-1.0 |
| Calendar subscription (.ics) | Keep has none | ✅ 🔀 opt-in secret feed URL (`/api/calendar/&lt;token&gt;.ics`), rotatable/revocable in Settings; recurrence expanded into UTC events so wall-clock survives DST | post-1.0 |
| Merge notes | Keep has none (Apple Notes does) | ✅ 🔀 "Merge" in the selection bar: the first note on the board keeps its id and per-user state, the rest are folded in (markdown sections into a text note, items into a list) and trashed | post-1.0 |
| Markdown import / export | Keep has none | ✅ 🔀 per-note "Download as .md", a `markdown/` copy of every note in the export zip (YAML front matter for labels/color/pin), `.md` upload and markdown-vault zips on import | post-1.0 |
| Print / "Save as PDF" | Keep has none | ✅ 🔀 "Print" in the note and card menus builds a clean sheet in the browser (title, images, body or checklist, labels + edited stamp), hides the app for `@media print` and names the PDF after the note | post-1.0 |
| Protect a note (PIN / password) | Keep has none (top-requested) | ✅ 🔀 "Protect note" hides title, body, checklist and images **server-side** and drops the note from search; the card keeps colour, pin and position. The account password — or an optional 4–8 digit PIN — reveals it for 15 minutes, per session. Per-user on shared notes; the public link goes dark while on; invisible to API tokens (and so to MCP). Hidden, not encrypted | post-1.0 |
| Autosave + limits (title ~999, body 19,999) | ✓ | ✅ 🔀 500ms debounce, dirty-field patches, flush on blur; footer word/character count warns before the body cap | M2 |
| Archive view + undo snackbar | ✓ | ✅ inverse-mutation undo | M2 |
| Trash: 7-day banner, read-only, restore/delete forever/empty | ✓ | ✅ 🔀 + hourly purge job; retention configurable via `TRASH_RETENTION_DAYS` (default 7) and the banner states it | M2 |
| Version history + download | ✓ (.txt) | ✅ 🔀 session-boundary snapshots; snapshots store markdown, so a restore keeps the formatting and the download is a `.md` | M2 |
| Grid ↔ list toggle | ✓ | ✅ synced via settings.viewMode | M2 |
| Checklists: Enter split, indent 1 level, drag reorder | ✓ | ✅ (Tab/Ctrl+] and dragging ~24px sideways too; first item can't indent; parent check cascades) | M3 |
| Completed items section (collapsible, per setting) | ✓ | ✅ | M3 |
| Uncheck all / Delete checked | ✓ | ✅ | M3 |
| Note ↔ list conversion (Ctrl+Shift+8) | ✓ | ✅ card + editor menus + shortcut | M3 |
| Card summary "+ N completed items" | ✓ | ✅ | M3 |
| Settings dialog (6 toggles/fields) | ✓ | ✅ instant-apply + theme select | M3 |
| Labels: 50 cap, Edit labels modal, sidebar, chips, routes | ✓ | ✅ 🔀 per-user; case-insensitive uniqueness; plus a colour and an emoji per label and a manual (drag/arrow) order instead of Keep's fixed alphabetical one | M4 |
| `#` quick-labeling in body | ✓ | ✅ opens picker w/ filter (popover variant) | M4 |
| Search: instant, filter tiles (Types/Labels/People/Colors) | ✓ | ✅ client-side instant + server FTS endpoint (ts_headline snippet); all six type tiles, People tiles built from the corpus, every filter combinable | M4 |
| Search: archive grouping, "No matching results." | ✓ | ✅ | M4 |
| Search operators | Keep has none | ✅ 🔀 `label:`, `color:` (palette name or everyday word), `has:`, `is:pinned\|unpinned\|archived\|unarchived`, `before:`/`after:YYYY-MM-DD` (edited day, UTC) and `-` to exclude a word or a filter; quoted values for names with spaces. One parser in `@openkeep/shared` runs in the browser over the corpus and inside `/api/search` as SQL, so the box, the API and the MCP `search_notes` all read a query the same way; each operator shows as a chip that rewrites the query when dismissed | post-1.0 |
| Saved searches | Keep has none | ✅ 🔀 "Save search" on the search screen turns the screen into a sidebar shortcut, next to the labels. The tile filters (type, label, color) are folded into the query language, so a saved search is a name plus the one string the box, `/api/search` and MCP `search_notes` all accept; the People filter, being a user id, rides alongside it. The same control removes it, and the list roams in `settings.savedSearches` (cap 20) | post-1.0 |
| Linking one note to another (`[[`) | Keep has none (every note is an isolated post-it) | ✅ 🔀 `[[` opens a note picker in the body and inserts a link labelled with the target's title; the editor follows it in the same tab, and the target lists a "Mentioned in N notes" panel nobody has to maintain. The link is an ordinary anchor carrying the app's deep link (`?note=<uuid>`, DECISIONS #29), so it round-trips through the sanitizer, `.md` export/import, versions, print and the MCP | post-1.0 |
| Note templates | Keep has none (a felt gap for people leaving for Notion/Obsidian) | ✅ 🔀 "Save as template" in the note and card menus moves the note onto a Templates shelf — a per-user flag on `note_members`, so it leaves the board, the archive, search, the reminder list and the `[[` picker in one step, and the same menu item brings it back. "Use template" is the copy the app already makes (a copy never inherits the flag), reachable from the composer, the mobile FAB and the template itself. The sidebar row and the entry points appear only once a template exists | post-1.0 |
| Find inside an open note (Ctrl+F) | Keep has none (missing for 13 years) | ✅ 🔀 bar over the editor, whole note in reading order (title + body/items), accent- and case-insensitive, `1/3` counter with wrapping Enter/Shift+Enter; the body marks the matched words, the native textareas (title, items) are highlighted whole | post-1.0 |
| Images: multi-upload, stack above title, delete | ✓ | ✅ magic-byte validation, EXIF strip, thumbs | M5 |
| Any other file attached to a note | Keep has none (images and audio only) | ✅ 🔀 `POST /api/notes/:id/files` accepts PDF, OOXML/ODF documents, legacy Office, zip/epub and text (≤ 25 MB, ≤ 25 per note); the bytes prove the container and the extension names the format inside it, so a declared mime is still worth nothing (DECISIONS #31). Download chips sit with the link previews on the card, in the editor and on the public link page, and every file is served `Content-Disposition: attachment` — never rendered on our origin. Findable with `has:file` and the "Files" search tile | post-1.0 |
| Drawings: full-screen editor (pen/marker/highlighter, 28 colors × 8 sizes, stroke eraser + Clear page, grid paper, undo/redo, New drawing / Export as image / Delete current drawing), re-editable | ✓ | ✅ 🔀 vector strokes + ink-cropped PNG render, in-place re-save cache-busted | post-1.0 |
| Drawing extras: lasso select, canvas zoom/pan, drawing over a photo, auto-extending canvas | ✓ | ✅ 🔀 the lasso takes strokes it encloses whole and moves them in one undo step; ctrl+wheel/pinch/space-drag plus a zoom pill whose floor is the fit scale; the page grows under a pen held at the bottom edge; "Draw on image" opens a drawing over a photo of the same note (`drawing_data.photoAttachmentId`), which the note then shows in the photo's place — the original stays attached, and the composite is stored as JPEG rather than megabytes of PNG | post-1.0 |
| Audio attachment playback | ✓ | ✅ player; Takeout import ingests audio (3gp/m4a/mp3/ogg/aac/amr/wav, magic-sniffed) | M5 |
| Audio recording in the browser | Keep web cannot record (Android only) | ✅ 🔀 `MediaRecorder` from the editor toolbar, the mobile "Add to note" sheet and the FAB; a bar over the note shows the elapsed time with Stop / Discard, and the take stops itself at 10 min. The container is negotiated per engine (Opus in WebM, Opus in Ogg, AAC in MP4) and lands on `POST /api/notes/:id/audio`, where magic bytes decide the type as everywhere else — a WebM declaring a video track is refused | post-1.0 |
| Link preview chips + setting | ✓ | ✅ SSRF-safe pinned-IP fetch; browser loads images | M5 |
| Reminders: presets, custom, recurrence, view, chips | classic Keep UX | ✅ 🔀 native (per-user; DST-correct wall-clock recurrence incl. custom "every N days/weeks/months/years") | M6 |
| Web push + in-app notifications | classic Keep UX | ✅ 🔀 VAPID push (opt-in on first reminder) + in-app toasts | M6 |
| Sharing: invite by email, single permission level | ✓ | ✅ registered users; both-side sharing setting; 20 cap | M7 |
| Sharing permission levels | Keep has only "can edit" | ✅ 🔀 "Can edit" / "Can view" per member, changeable after the fact; view-only freezes the shared content (title, body, items, attachments, type, version restore) but not the viewer's own pin, colour, labels, reminder or board order | post-1.0 |
| Public read-only link | Keep has none (sharing needs a Google account) | ✅ 🔀 the owner mints one address per note in the Share dialog (optional 7/30-day expiry); `/s/<token>` renders the note — title, body or checklist, images, drawings, audio — with no session anywhere on the path, `noindex` in the response and in robots.txt. Only shared content travels: no labels, reminder, pin or anyone's name. Re-issuing replaces the address, revoking deletes it, and trashing the note takes it dark until the note is restored (DECISIONS #30) | post-1.0 |
| Per-user pin/archive/color/labels/reminders/order on shared notes | ✓ | ✅ WS isolation integration-tested | M7 |
| ~1s realtime propagation | ✓ | ✅ <1s asserted; echo suppression via X-Client-Id | M7 |
| Keyboard shortcuts (map + ? dialog) | ✓ | ✅ scope-stack engine; registry = shared constant; the list-item four (`n`/`p`/`Shift+N`/`Shift+P`) reach their non-typing "selected item" via `Esc` out of the field — post-1.0 | M8 |
| Grid keyboard focus | j/k + Tab through cards | ✅ 🔀 roving tabindex — one tab stop per grid, arrows move it geometrically (masonry columns), j/k keep reading order | post-1.0 |
| Multi-select: hover check, marquee, top bar, bulk ops | ✓ | ✅ 🔀 hover check, mouse marquee (both buttons, add-only), background click clears, x, Ctrl+A, bulk pin/color/archive/trash/copy/remind/labels (tri-state) — plus bulk collaborator and bulk merge, which Keep has neither of | M8 |
| Drag reorder notes (per-user, synced) | ✓ | ✅ fractional positions; cross-section drag flips pin | M8 |
| Sort the grid | Keep has manual order only | ✅ 🔀 "Sort notes" in the top bar: manual (default) · date edited · date created · title, roaming via `settings.noteSort`. Client-side over the corpus in Notes/Archive/label/search — Trash and Reminders keep their own order — and no sort writes a position, so drag is disabled off manual and switching back restores the arrangement | post-1.0 |
| Responsive: drawer sidebar, 1-col ≤600px | ✓ | ✅ 🔀 phones now mirror the Keep Android app instead (DECISIONS #23) | M8 |
| Mobile (<768px): search-pill bar, 2-up grid, create FAB, full-screen editor + bottom sheets, long-press select, full-height drawer w/ Settings | Keep web has none (Android app UX) | ✅ 🔀 CSS-breakpoint layer over the same DOM; untouched FAB notes discarded on close; e2e `mobile.spec.ts` | post-1.0 |
| PWA installable + cached reads | Keep has none | ✅ 🔀 Workbox precache + NetworkFirst API + update prompt; push in same SW | M8 |
| App shortcuts on the installed icon | Keep has none | ✅ 🔀 manifest `shortcuts` → New note / New list / New drawing, as deep links the shell already handles | post-1.0 |
| Share sheet target ("Share → OpenKeep") | Keep has none on web | ✅ 🔀 manifest `share_target` POSTs to `/share`; the service worker stashes the multipart body in the Cache API and the route drains it into a new note (text, url and images) | post-1.0 |
| Takeout import | — (adoption feature) | ✅ 🔀 images + audio, 512 MB archives, media read on demand, version snapshot at import | M9 |
| JSON export | Takeout equivalent | ✅ | M9 |
| Offline edits survive reload | Keep has none | ✅ 🔀 IndexedDB outbox + localStorage draft mirror + offline banner/retry toasts (DECISIONS #22) | post-1.0 |
| Outgoing webhooks | Keep has none (no automation surface at all) | ✅ 🔀 Settings → Webhooks: up to 5 endpoints per account, each subscribed to any of seven note-level events (created, edited, state changed, trashed, restored, deleted, reminder fired). Every request is a signed POST — `X-OpenKeep-Signature: sha256=HMAC(secret, "<timestamp>.<body>")` — carrying `{event, noteId, note}` with the note as the API would return it, so n8n/Home Assistant never call back. Delivery is a queued job with capped exponential backoff, and reaching a private LAN address needs `WEBHOOK_ALLOW_PRIVATE_TARGETS` (DECISIONS #34) | post-1.0 |
| Instance administration | Keep has none (Google runs it) | ✅ 🔀 `ADMIN_EMAILS` puts an Administration panel in the gear menu: instance totals, disk use per account, an "allow new accounts" switch enforced where an account is born (form and OAuth alike), and account deletion with its notes and files. Session-only, so no PAT or MCP client reaches it; admin-ness comes only from the env (DECISIONS #32) | post-1.0 |
| Storage quota per account | Keep has one Drive quota, not one per note-taker | ✅ 🔀 `USER_STORAGE_QUOTA_MB` caps attachment bytes per account (trash included), charged to the note's **owner** so it matches the panel's accounting; Settings shows usage against it and an upload past it is refused with `storage_quota_exceeded` (DECISIONS #33) | post-1.0 |

## Known deferrals in v1.0

Planned (or Keep-parity) items consciously not shipped in v1.0 — tracked here so
the table above stays honest. Roughly in order of user impact:

- **Offline media** — composer image files live only in memory: an
  offline-composed note restores its text/labels/reminder after a reload, but
  not unsaved images. Attachment uploads pause while offline and resume within
  the session only (FormData is not persisted to the outbox).
- **Takeout `sharees`** — imported notes are never re-shared; the import report
  now says how many were shared in Keep. `annotations` (WEBLINK) are typed but
  unused (links are re-detected from text).
- **Sentry (or any error-reporting SaaS)** — not wired; `/metrics` now ships
  (opt-in Prometheus), but crash reporting is still logs-only.
