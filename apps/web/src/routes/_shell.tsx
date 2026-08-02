import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useRef } from 'react';
import { z } from 'zod';
import { DrawingScreen } from '../components/drawing/DrawingScreen.js';
import { MarqueeOverlay } from '../components/grid/MarqueeOverlay.js';
import { EditLabelsDialog } from '../components/labels/EditLabelsDialog.js';
import { EditorModal } from '../components/notes/EditorModal.js';
import { SnackbarHost } from '../components/SnackbarHost.js';
import { AdminDialog } from '../components/shell/AdminDialog.js';
import { ApiTokensDialog } from '../components/shell/ApiTokensDialog.js';
import { ImportExportDialog } from '../components/shell/ImportExportDialog.js';
import { OfflineBanner } from '../components/shell/OfflineBanner.js';
import { SelectionBar } from '../components/shell/SelectionBar.js';
import { SettingsDialog } from '../components/shell/SettingsDialog.js';
import { ShortcutsDialog } from '../components/shell/ShortcutsDialog.js';
import { Sidebar } from '../components/shell/Sidebar.js';
import { TopBar } from '../components/shell/TopBar.js';
import { WebhooksDialog } from '../components/shell/WebhooksDialog.js';
import { useAppKeys } from '../hooks/use-app-keys.jsx';
import { useComposeShortcut } from '../hooks/use-compose-shortcut.js';
import { useDraftRestore } from '../hooks/use-draft-restore.js';
import { useGridAutoScroll } from '../hooks/use-grid-auto-scroll.js';
import { useMarqueeSelection } from '../hooks/use-marquee-selection.js';
import { usePushRegistration } from '../hooks/use-push.js';
import { useRealtime } from '../hooks/use-realtime.js';
import { useReminderToasts } from '../hooks/use-reminder-toasts.js';
import { useUnsavedGuard } from '../hooks/use-unsaved-guard.js';
import { sessionQuery } from '../lib/queries.js';
import { useUiStore } from '../stores/ui.js';

// `?note=<id>` opens the editor modal on ANY shell route (deep-linkable;
// back button closes it). `new` marks a note just created by the mobile FAB:
// the editor discards it on close if it is still untouched. `drawing` opens
// the full-screen drawing editor: `new` (optionally without a note yet — the
// note is only created when ink is saved) or an attachment id to re-edit.
// `compose` is the app-shortcut entry point (manifest `shortcuts`): it creates
// a note of that type and hands over to `note`/`new`. `record` arms the
// microphone in the editor it opens with (the FAB's "Recording"), and the
// editor drops it from the URL the moment it acts on it — a reload should not
// start recording again.
const shellSearch = z.object({
  note: z.string().uuid().optional(),
  new: z.boolean().optional(),
  drawing: z.union([z.literal('new'), z.string().uuid()]).optional(),
  compose: z.enum(['text', 'list']).optional(),
  record: z.boolean().optional(),
});

export const Route = createFileRoute('/_shell')({
  validateSearch: shellSearch,
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery);
    if (!session) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    return { session };
  },
  component: ShellLayout,
});

function ShellLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const mainRef = useRef<HTMLElement | null>(null);
  const marquee = useMarqueeSelection(mainRef);
  useGridAutoScroll();
  useRealtime();
  useReminderToasts();
  usePushRegistration();
  useAppKeys();
  useUnsavedGuard();
  useDraftRestore();
  useComposeShortcut();
  return (
    <div className="min-h-full">
      <TopBar />
      <Sidebar />
      <main
        ref={mainRef}
        className={`pt-(--topbar-h) transition-[margin] duration-150 ${
          sidebarOpen ? 'md:ml-(--sidebar-w)' : 'md:ml-(--rail-w)'
        }`}
      >
        <Outlet />
      </main>
      <MarqueeOverlay box={marquee} />
      <OfflineBanner />
      <EditorModal />
      <DrawingScreen />
      <SettingsDialog />
      <EditLabelsDialog />
      <ShortcutsDialog />
      <ImportExportDialog />
      <ApiTokensDialog />
      <WebhooksDialog />
      <AdminDialog />
      <SelectionBar />
      <SnackbarHost />
    </div>
  );
}
