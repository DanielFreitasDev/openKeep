import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Warn before unload while offline with writes still pending — the window
 * where a reload can outrun both the draft mirror and the persisted outbox.
 */
export function useUnsavedGuard() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (navigator.onLine) return;
      const pending = queryClient
        .getMutationCache()
        .getAll()
        .some((m) => m.state.status === 'pending');
      if (pending) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [queryClient]);
}
