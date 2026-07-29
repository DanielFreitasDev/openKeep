import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { useRef } from 'react';
import { z } from 'zod';
import { MarqueeOverlay } from '../components/grid/MarqueeOverlay.js';
import { EditLabelsDialog } from '../components/labels/EditLabelsDialog.js';
import { EditorModal } from '../components/notes/EditorModal.js';
import { SnackbarHost } from '../components/SnackbarHost.js';
import { ApiTokensDialog } from '../components/shell/ApiTokensDialog.js';
import { ImportExportDialog } from '../components/shell/ImportExportDialog.js';
import { SelectionBar } from '../components/shell/SelectionBar.js';
import { SettingsDialog } from '../components/shell/SettingsDialog.js';
import { ShortcutsDialog } from '../components/shell/ShortcutsDialog.js';
import { Sidebar } from '../components/shell/Sidebar.js';
import { TopBar } from '../components/shell/TopBar.js';
import { useAppKeys } from '../hooks/use-app-keys.jsx';
import { useMarqueeSelection } from '../hooks/use-marquee-selection.js';
import { usePushRegistration } from '../hooks/use-push.js';
import { useRealtime } from '../hooks/use-realtime.js';
import { useReminderToasts } from '../hooks/use-reminder-toasts.js';
import { sessionQuery } from '../lib/queries.js';
import { useUiStore } from '../stores/ui.js';

// `?note=<id>` opens the editor modal on ANY shell route (deep-linkable;
// back button closes it).
const shellSearch = z.object({
  note: z.string().uuid().optional(),
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
  useRealtime();
  useReminderToasts();
  usePushRegistration();
  useAppKeys();
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
      <EditorModal />
      <SettingsDialog />
      <EditLabelsDialog />
      <ShortcutsDialog />
      <ImportExportDialog />
      <ApiTokensDialog />
      <SelectionBar />
      <SnackbarHost />
    </div>
  );
}
