import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import i18n, { initI18n } from './i18n/index.js';
import { ApiError } from './lib/api.js';
import { registerNoteMutationDefaults } from './lib/note-mutation-defaults.js';
import { queryPersister } from './lib/query-persister.js';
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
    mutations: {
      // Server replies (ApiError) fail fast; transport failures while the
      // browser claims to be online retry with backoff before erroring.
      // Fully offline mutations pause instead (networkMode 'online').
      retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
  },
});

registerNoteMutationDefaults(queryClient);

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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 24 * 3600 * 1000,
        buster: 'outbox-v1',
        dehydrateOptions: {
          // Offline reads come from the service worker cache; persist only
          // the outbox — paused, keyed mutations whose lifecycle lives in
          // registerNoteMutationDefaults.
          shouldDehydrateQuery: () => false,
          shouldDehydrateMutation: (mutation) =>
            mutation.state.isPaused && mutation.options.mutationKey !== undefined,
        },
      }}
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
