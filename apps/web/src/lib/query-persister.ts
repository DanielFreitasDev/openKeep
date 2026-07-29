import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

/**
 * IndexedDB-backed persister for the mutation outbox. Queries are NOT
 * persisted (see shouldDehydrateQuery in main.tsx): offline reads come from
 * the service worker's NetworkFirst cache; this store only keeps paused
 * writes alive across reloads.
 */
export const queryPersister = createAsyncStoragePersister({
  key: 'openkeep-outbox',
  // Tiny payload (paused mutations only) — keep the loss window short.
  throttleTime: 250,
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
});
