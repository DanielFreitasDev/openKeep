import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import i18n, { initI18n } from './i18n/index.js';
import { routeTree } from './routeTree.gen.js';
import { useSnackbarStore } from './stores/snackbar.js';

void initI18n();

// PWA: prompt-style updates via the snackbar.
const updateSW = registerSW({
  onNeedRefresh() {
    useSnackbarStore.getState().show({
      message: i18n.t('common:updateAvailable'),
      actionLabel: i18n.t('common:reload'),
      onAction: () => void updateSW(true),
      durationMs: 60_000,
    });
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
