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
| Editor modal (formatting bar, Edited tooltip, undo/redo, close) | ✓ | ✅ ?note= deep link; morphs open/closed from its card; Esc/Ctrl+Enter close; undo covers the body (title/items deferred, see below) | M2 |
| Rich formatting H1/H2/normal/B/I/U/clear | ✓ (May-2025 set) | ✅ TipTap, server-sanitized allowlist | M2 |
| Autosave + limits (title ~999, body 19,999) | ✓ | ✅ 🔀 500ms debounce, dirty-field patches, flush on blur; footer word/character count warns before the body cap | M2 |
| Archive view + undo snackbar | ✓ | ✅ inverse-mutation undo | M2 |
| Trash: 7-day banner, read-only, restore/delete forever/empty | ✓ | ✅ 🔀 + hourly purge job; retention configurable via `TRASH_RETENTION_DAYS` (default 7) and the banner states it | M2 |
| Version history + .txt download | ✓ (+restore 🔀) | ✅ session-boundary snapshots | M2 |
| Grid ↔ list toggle | ✓ | ✅ synced via settings.viewMode | M2 |
| Checklists: Enter split, indent 1 level, drag reorder | ✓ | ✅ (Tab/Ctrl+] too; first item can't indent; parent check cascades) | M3 |
| Completed items section (collapsible, per setting) | ✓ | ✅ | M3 |
| Uncheck all / Delete checked | ✓ | ✅ | M3 |
| Note ↔ list conversion (Ctrl+Shift+8) | ✓ | ✅ card + editor menus + shortcut | M3 |
| Card summary "+ N completed items" | ✓ | ✅ | M3 |
| Settings dialog (6 toggles/fields) | ✓ | ✅ instant-apply + theme select | M3 |
| Labels: 50 cap, Edit labels modal, sidebar, chips, routes | ✓ | ✅ per-user; case-insensitive uniqueness | M4 |
| `#` quick-labeling in body | ✓ | ✅ opens picker w/ filter (popover variant) | M4 |
| Search: instant, filter tiles (Types/Labels/People/Colors) | ✓ | ✅ client-side instant + server FTS endpoint (ts_headline snippet); all six type tiles, People tiles built from the corpus, every filter combinable | M4 |
| Search: archive grouping, "No matching results." | ✓ | ✅ | M4 |
| Images: multi-upload, stack above title, delete | ✓ | ✅ magic-byte validation, EXIF strip, thumbs | M5 |
| Drawings: full-screen editor (pen/marker/highlighter, 28 colors × 8 sizes, stroke eraser + Clear page, grid paper, undo/redo, New drawing / Export as image / Delete current drawing), re-editable | ✓ | ✅ 🔀 vector strokes + ink-cropped PNG render, in-place re-save cache-busted; lasso/zoom/draw-on-image deferred (below) | post-1.0 |
| Audio attachment playback | ✓ | ✅ player; Takeout import ingests audio (3gp/m4a/mp3/ogg/aac/amr/wav, magic-sniffed) — recording itself is post-1.0 | M5 |
| Link preview chips + setting | ✓ | ✅ SSRF-safe pinned-IP fetch; browser loads images | M5 |
| Reminders: presets, custom, recurrence, view, chips | classic Keep UX | ✅ 🔀 native (per-user; DST-correct wall-clock recurrence incl. custom "every N days/weeks/months/years") | M6 |
| Web push + in-app notifications | classic Keep UX | ✅ 🔀 VAPID push (opt-in on first reminder) + in-app toasts | M6 |
| Sharing: invite by email, single permission level | ✓ | ✅ registered users; both-side sharing setting; 20 cap | M7 |
| Per-user pin/archive/color/labels/reminders/order on shared notes | ✓ | ✅ WS isolation integration-tested | M7 |
| ~1s realtime propagation | ✓ | ✅ <1s asserted; echo suppression via X-Client-Id | M7 |
| Keyboard shortcuts (map + ? dialog) | ✓ | ✅ scope-stack engine; registry = shared constant; n/p item shortcuts deferred (see below) | M8 |
| Multi-select: hover check, marquee, top bar, bulk ops | ✓ | ✅ hover check, mouse marquee (both buttons, add-only), background click clears, x, Ctrl+A, bulk pin/color/archive/trash/copy | M8 |
| Drag reorder notes (per-user, synced) | ✓ | ✅ fractional positions; cross-section drag flips pin | M8 |
| Responsive: drawer sidebar, 1-col ≤600px | ✓ | ✅ 🔀 phones now mirror the Keep Android app instead (DECISIONS #23) | M8 |
| Mobile (<768px): search-pill bar, 2-up grid, create FAB, full-screen editor + bottom sheets, long-press select, full-height drawer w/ Settings | Keep web has none (Android app UX) | ✅ 🔀 CSS-breakpoint layer over the same DOM; untouched FAB notes discarded on close; e2e `mobile.spec.ts` | post-1.0 |
| PWA installable + cached reads | Keep has none | ✅ 🔀 Workbox precache + NetworkFirst API + update prompt; push in same SW | M8 |
| App shortcuts on the installed icon | Keep has none | ✅ 🔀 manifest `shortcuts` → New note / New list / New drawing, as deep links the shell already handles | post-1.0 |
| Takeout import | — (adoption feature) | ✅ 🔀 images + audio, 512 MB archives, media read on demand, version snapshot at import | M9 |
| JSON export | Takeout equivalent | ✅ | M9 |
| Offline edits survive reload | Keep has none | ✅ 🔀 IndexedDB outbox + localStorage draft mirror + offline banner/retry toasts (DECISIONS #22) | post-1.0 |

## Known deferrals in v1.0

Planned (or Keep-parity) items consciously not shipped in v1.0 — tracked here so
the table above stays honest. Roughly in order of user impact:

- **Drawing tool extras** — the lasso select tool, canvas zoom/pan (Keep's
  fit button), drawing on top of photos and the auto-extending canvas are not
  in the drawing editor; the page size is fixed at creation and the grid
  choice is saved per drawing.
- **Bulk "Remind" and "Change labels"** in the selection bar — per-note flows
  exist; the bulk variants don't.
- **List-item shortcuts `n`/`p`/`Shift+N`/`Shift+P`** — require a non-typing
  "selected item" editor focus state our native-textarea checklist doesn't
  have; removed from the "?" dialog rather than advertised dead.
- **Checklist indent by dragging right** — Keep also indents when an item is
  dragged rightward; we ship `Ctrl+]`/`[` and Tab/Shift+Tab only (item drag
  changes order, not indent).
- **Grid virtualization >400 cards/section** — every card renders; the ~5k-note
  ceiling documented in ARCHITECTURE.md still applies.
- **Offline media** — composer image files live only in memory: an
  offline-composed note restores its text/labels/reminder after a reload, but
  not unsaved images. Attachment uploads pause while offline and resume within
  the session only (FormData is not persisted to the outbox).
- **Roving tabindex in the grid** — all cards are tab stops (`tabIndex=0`);
  j/k navigation and focus restore work, but Tab order is not virtualized.
- **Session undo/redo for title/list items** — TipTap history covers the body;
  the title/items snapshot ring buffer was not built.
- **Takeout `sharees`** — imported notes are never re-shared and no warning is
  surfaced; `annotations` (WEBLINK) are typed but unused (links are re-detected
  from text).
- **`/metrics` endpoint** — `METRICS_ENABLED` is validated in config but no
  Prometheus route exists; Sentry is likewise absent.
- **E2E flows** — login/signup through the UI (specs seed via API) are not
  covered by Playwright. (The PWA offline-reload flow gained coverage
  post-1.0: `offline.spec.ts` + the `pwa` project's `offline-pwa.spec.ts`.)
