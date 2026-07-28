import type { CreateApiToken } from '@openkeep/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api.js';
import { createTokenApi, revokeTokenApi, tokensQuery } from '../lib/tokens-api.js';
import { useSnackbarStore } from '../stores/snackbar.js';

export function useTokenMutations() {
  const queryClient = useQueryClient();
  const show = useSnackbarStore((s) => s.show);

  // The secret flows back to the caller (reveal-once panel) — never cached.
  const create = useMutation({
    mutationFn: (input: CreateApiToken) => createTokenApi(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey }),
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'token_limit_reached') {
        show({ message: err.problem.detail ?? err.problem.title });
      }
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeTokenApi(id),
    onMutate: (id) => {
      queryClient.setQueryData(tokensQuery.queryKey, (old) => old?.filter((t) => t.id !== id));
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey }),
  });

  return { create, revoke };
}
