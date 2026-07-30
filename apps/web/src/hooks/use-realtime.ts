import { WS_PING, WS_PONG, type WsEnvelope } from '@openkeep/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clientId } from '../lib/client-id.js';
import { notesQuery } from '../lib/notes-api.js';
import { applyWsEvent } from '../lib/realtime-apply.js';
import { useSnackbarStore } from '../stores/snackbar.js';

/** Probe cadence, and how long a socket may stay silent before we give up on it. */
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

/**
 * Single WS per tab: cookie auth, 1→30s backoff with jitter, reconnect on
 * visibility/online, own echoes dropped via origin === clientId. On
 * (re)connect active queries are invalidated — WS is an accelerator over the
 * online-first refetch baseline (no oplog).
 *
 * A half-open socket (sleep, NAT timeout, proxy drop) never fires `close`, so
 * visibility/online alone can leave a tab silently stale. The heartbeat probes
 * for a `pong` and closes the socket when nothing at all has arrived in
 * HEARTBEAT_TIMEOUT_MS — handing it to the normal backoff reconnect.
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
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let everConnected = false;
    let lastSeen = 0;

    /** True when the socket still reports OPEN but has gone quiet for too long. */
    const isStale = () => state.socket !== null && Date.now() - lastSeen > HEARTBEAT_TIMEOUT_MS;

    const connect = () => {
      if (state.closed || state.socket) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${proto}://${window.location.host}/api/ws`);
      state.socket = socket;

      socket.onopen = () => {
        state.attempts = 0;
        lastSeen = Date.now();
        heartbeat = setInterval(() => {
          if (isStale()) {
            socket.close(); // onclose schedules the reconnect
            return;
          }
          if (socket.readyState === WebSocket.OPEN) socket.send(WS_PING);
        }, HEARTBEAT_INTERVAL_MS);
        if (everConnected) {
          // Missed events are harmless by design — refetch what's active.
          void queryClient.invalidateQueries();
        }
        everConnected = true;
      };

      socket.onmessage = (raw) => {
        lastSeen = Date.now();
        if (raw.data === WS_PONG) return;

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
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = undefined;
        if (state.closed) return;
        const backoff = Math.min(30_000, 1000 * 2 ** state.attempts);
        const jitter = backoff * (0.5 + Math.random() * 0.5);
        state.attempts += 1;
        timer = setTimeout(connect, jitter);
      };
      socket.onerror = () => socket.close();
    };

    const kick = () => {
      if (document.visibilityState !== 'visible' || state.closed) return;
      // Waking from sleep is the common case: timers were frozen, so the
      // heartbeat never got to notice the socket died under us.
      if (isStale()) {
        state.socket?.close();
        return;
      }
      if (!state.socket) {
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
      if (heartbeat) clearInterval(heartbeat);
      state.socket?.close();
      state.socket = null;
    };
  }, [queryClient, navigate, show, t]);
}
