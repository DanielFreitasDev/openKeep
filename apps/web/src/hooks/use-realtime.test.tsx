// @vitest-environment happy-dom
import { WS_PING, WS_PONG } from '@openkeep/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const { useRealtime } = await import('./use-realtime.js');

const INTERVAL = 25_000;

/** Minimal stand-in: the hook only ever touches these members. */
class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = FakeSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}

function renderRealtime() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useRealtime(), { wrapper });
  const socket = FakeSocket.instances.at(-1)!;
  act(() => socket.onopen?.());
  return { ...view, socket, invalidate };
}

describe('useRealtime heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('probes the server on an interval', () => {
    const { socket, unmount } = renderRealtime();
    expect(socket.sent).toEqual([]);

    act(() => vi.advanceTimersByTime(INTERVAL));
    expect(socket.sent).toEqual([WS_PING]);

    unmount();
  });

  // A pong is plumbing, not a domain event: it must not reach the cache layer
  // or every heartbeat would trigger a corpus refetch.
  it('treats a pong as liveness only', () => {
    const { socket, invalidate, unmount } = renderRealtime();
    invalidate.mockClear();

    for (let i = 0; i < 5; i++) {
      act(() => vi.advanceTimersByTime(INTERVAL));
      act(() => socket.onmessage?.({ data: WS_PONG }));
    }

    expect(socket.readyState).toBe(FakeSocket.OPEN);
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  // The failure this whole mechanism exists for: the socket still reports
  // OPEN, but nothing has come back for a full timeout window.
  it('closes and reconnects a socket that stopped answering', () => {
    const { socket, unmount } = renderRealtime();
    expect(FakeSocket.instances).toHaveLength(1);

    act(() => vi.advanceTimersByTime(INTERVAL * 3));
    expect(socket.readyState).toBe(3);

    // Backoff for the first retry is 1s, jittered down to 500ms.
    act(() => vi.advanceTimersByTime(1000));
    expect(FakeSocket.instances).toHaveLength(2);

    unmount();
  });

  it('drops a socket that went stale while the tab was hidden', () => {
    const { socket, unmount } = renderRealtime();

    // Timers are frozen while hidden, so the interval never runs; only the
    // visibility handler is left to notice.
    vi.setSystemTime(Date.now() + 5 * 60_000);
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(socket.readyState).toBe(3);
    unmount();
  });
});
