# Keep Parity Checklist

Side-by-side verification against keep.google.com. Updated at the end of every milestone.

Legend: ✅ verified parity · 🚧 in progress · ⬜ not started · 🔀 deliberate divergence (see DECISIONS.md)

| Area | Keep web behavior | Status | Milestone |
|---|---|---|---|
| Monorepo, CI, dev stack | — (infrastructure) | ✅ | M0 |
| Email/password auth | Google account | ✅ 🔀 self-hosted auth (Better Auth; optional Google/GitHub OAuth) | M1 |
| Top bar (hamburger, logo, search, refresh, view toggle, gear, account) | ✓ | ✅ (search input active in M4) | M1 |
| Sidebar rail ↔ expanded, hover slide-out | ✓ | ✅ (labels added M4) | M1 |
| Dark theme + distinct note-color palette | ✓ | ✅ tokens + toggle + follow-system | M1 |
| Composer ("Take a note…", New list, New note with image) | ✓ | ✅ (list M3, image M5; expand on click/type; click-away saves) | M2 |
| "Empty note discarded" | ✓ | ✅ snackbar | M2 |
| Masonry grid, PINNED/OTHERS sections | ✓ | ✅ shortest-column flow, 240px cards, FLIP moves | M2 |
| Note card hover toolbar (remind, collaborator, color, image, archive, more) | ✓ | ✅ color/archive/more (+pin); remind M6, collaborator M7, image M5 | M2 |
| 12 colors, light+dark | ✓ | ✅ verified via e2e in both themes | M2 |
| 9 background illustrations | ✓ themes, original art | ✅ 🔀 original line-art, theme-adaptive | M2 |
| Editor modal (formatting bar, Edited tooltip, undo/redo, close) | ✓ | ✅ ?note= deep link; Esc/Ctrl+Enter close | M2 |
| Rich formatting H1/H2/normal/B/I/U/clear | ✓ (May-2025 set) | ✅ TipTap, server-sanitized allowlist | M2 |
| Autosave + limits (title ~999, body 19,999) | ✓ | ✅ 500ms debounce, dirty-field patches | M2 |
| Archive view + undo snackbar | ✓ | ✅ inverse-mutation undo | M2 |
| Trash: 7-day banner, read-only, restore/delete forever/empty | ✓ | ✅ + hourly purge job | M2 |
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
| Search: instant, filter tiles (Types/Labels/People/Colors) | ✓ | ✅ client-side instant + server FTS endpoint; People M7, media types M5 | M4 |
| Search: archive grouping, "No matching results." | ✓ | ✅ | M4 |
| Images: multi-upload, stack above title, delete | ✓ | ⬜ | M5 |
| Audio attachment playback | ✓ | ⬜ | M5 |
| Link preview chips + setting | ✓ | ⬜ | M5 |
| Reminders: presets, custom, recurrence, view, chips | classic Keep UX | ⬜ 🔀 native | M6 |
| Web push + in-app notifications | classic Keep UX | ⬜ 🔀 | M6 |
| Sharing: invite by email, single permission level | ✓ | ⬜ | M7 |
| Per-user pin/archive/color/labels/reminders/order on shared notes | ✓ | ⬜ | M7 |
| ~1s realtime propagation | ✓ | ⬜ | M7 |
| Keyboard shortcuts (full map + ? dialog) | ✓ | ⬜ | M8 |
| Multi-select: hover check, marquee, top bar, bulk ops | ✓ | ⬜ | M8 |
| Drag reorder notes (per-user, synced) | ✓ | ⬜ | M8 |
| Responsive: drawer sidebar, 1-col ≤600px | ✓ | ⬜ | M8 |
| PWA installable + cached reads | Keep has none | ⬜ 🔀 bonus | M8 |
| Takeout import | — (adoption feature) | ⬜ 🔀 | M9 |
| JSON export | Takeout equivalent | ⬜ | M9 |
