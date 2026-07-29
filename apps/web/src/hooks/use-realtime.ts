import type { WsEnvelope } from '@openkeep/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clientId } from '../lib/client-id.js';
import { notesQuery } from '../lib/notes-api.js';
import { applyWsEvent } from '../lib/realtime-apply.js';
import { useSnackbarStore } from '../stores/snackbar.js';

/**
 * Single WS per tab: cookie auth, 1→30s backoff with jitter, reconnect on
 * visibility/online, own echoes dropped via origin === clientId. On
 * (re)connect active queries are invalidated — WS is an accelerator over the
 * online-first refetch baseline (no oplog).
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const show = useSnackbarStore((s) => s.show);
  const { t } = useTranslation('reminders');
  const stateRef = useRef<{ socket: WebSocket | null; attempts: number; closed: boolean }>({
    socket: null,
    attempts: 0,
    closed: false,
  });

  useEffect(() => {
    const state = stateRef.current;
    state.closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let everConnected = false;

    const connect = () => {
      if (state.closed || state.socket) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      state.socket = socket;

      socket.onopen = () => {
        state.attempts = 0;
        if (everConnected) {
          // Missed events are harmless by design — refetch what's active.
          void queryClient.invalidateQueries();
        }
        everConnected = true;
      };

      socket.onmessage = (raw) => {
        let envelope: WsEnvelope;
        try {
          envelope = JSON.parse(String(raw.data)) as WsEnvelope;
        } catch {
          return;
        }
        if (envelope.origin === clientId) return; // own echo

        if (envelope.type === 'reminder.fired') {
          const payload = envelope.payload as { noteId: string; title: string };
          show({
            message: t('firedToast', { title: payload.title || t('untitled') }),
            actionLabel: t('open'),
            onAction: () =>
              void navigate({
                to: '.',
                search: (old: Record<string, unknown>) => ({ ...old, note: payload.noteId }),
                resetScroll: false,
              }),
            durationMs: 15_000,
          });
        }

        const applied = applyWsEvent(queryClient, envelope);
        if (!applied) {
          void queryClient.invalidateQueries({ queryKey: notesQuery.queryKey });
        }
      };

      socket.onclose = () => {
        state.socket = null;
        if (state.closed) return;
        const backoff = Math.min(30_000, 1000 * 2 ** state.attempts);
        const jitter = backoff * (0.5 + Math.random() * 0.5);
        state.attempts += 1;
        timer = setTimeout(connect, jitter);
      };
      socket.onerror = () => socket.close();
    };

    const kick = () => {
      if (document.visibilityState === 'visible' && !state.socket && !state.closed) {
        if (timer) clearTimeout(timer);
        state.attempts = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', kick);
    window.addEventListener('online', kick);

    connect();
    return () => {
      state.closed = true;
      document.removeEventListener('visibilitychange', kick);
      window.removeEventListener('online', kick);
      if (timer) clearTimeout(timer);
      state.socket?.close();
      state.socket = null;
    };
  }, [queryClient, navigate, show, t]);
}
