import type { CreateWebhook, UpdateWebhook } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api.js';
import {
  createWebhookApi,
  deleteWebhookApi,
  testWebhookApi,
  updateWebhookApi,
  webhooksQuery,
} from '../lib/webhooks-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';

export function useWebhookMutations() {
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: webhooksQuery.queryKey });

  const create = useMutation({
    mutationFn: (input: CreateWebhook) => createWebhookApi(input),
    onSuccess: invalidate,
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'webhook_limit_reached') {
        show({ message: err.problem.detail ?? err.problem.title });
      }
    },
  });

  /**
   * Optimistic, because the controls *are* the state: an events checkbox that
   * waits for the round-trip before moving reads as a click that did nothing.
   * The rotated secret is the one field we cannot guess, so the response is
   * written back over the guess.
   */
  const update = useMutation({
    mutationFn: ({ id, ...input }: UpdateWebhook & { id: string }) => updateWebhookApi(id, input),
    onMutate: ({ id, url, events, enabled }) => {
      queryClient.setQueryData(webhooksQuery.queryKey, (old) =>
        old?.map((w) =>
          w.id === id
            ? {
                ...w,
                ...(url !== undefined ? { url } : {}),
                ...(events !== undefined ? { events } : {}),
                ...(enabled !== undefined ? { enabled } : {}),
              }
            : w,
        ),
      );
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(webhooksQuery.queryKey, (old) =>
        old?.map((w) => (w.id === saved.id ? saved : w)),
      );
    },
    onError: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWebhookApi(id),
    onMutate: (id) => {
      queryClient.setQueryData(webhooksQuery.queryKey, (old) => old?.filter((w) => w.id !== id));
    },
    onError: invalidate,
  });

  // The test writes lastStatus/lastError server-side, so the list is refetched
  // either way — the returned result is what the dialog shows right now.
  const test = useMutation({
    mutationFn: (id: string) => testWebhookApi(id),
    onSettled: invalidate,
  });

  return { create, update, remove, test };
}
