import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { Sidebar } from '../components/shell/Sidebar.js';
import { TopBar } from '../components/shell/TopBar.js';
import { sessionQuery } from '../lib/queries.js';
import { useUiStore } from '../stores/ui.js';

export const Route = createFileRoute('/_shell')({
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
  return (
    <div className="min-h-full">
      <TopBar />
      <Sidebar />
      <main
        className={`pt-(--topbar-h) transition-[margin] duration-150 ${
          sidebarOpen ? 'ml-(--sidebar-w)' : 'ml-(--rail-w)'
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
}
