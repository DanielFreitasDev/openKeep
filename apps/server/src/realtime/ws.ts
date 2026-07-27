import websocket from '@fastify/websocket';
import type { App } from '../app.js';
import type { Auth } from '../auth/auth.js';
import type { Config } from '../config.js';
import { toWebHeaders } from '../plugins/auth.js';
import type { Realtime } from './registry.js';

/**
 * WS endpoint: session cookie validated on upgrade, Origin checked, one
 * logical channel per user. Server pings every 30s; dead sockets reaped.
 */
export async function registerWs(
  app: App,
  config: Config,
  auth: Auth,
  realtime: Realtime,
): Promise<void> {
  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  const appOrigin = new URL(config.APP_URL).origin;

  app.get('/api/ws', { websocket: true }, async (socket, req) => {
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== appOrigin) {
      socket.close(4403, 'forbidden origin');
      return;
    }
    const session = await auth.api.getSession({ headers: toWebHeaders(req) });
    if (!session) {
      socket.close(4401, 'unauthorized');
      return;
    }

    const userId = session.user.id;
    realtime.add(userId, socket);

    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const ping = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, 30_000);

    socket.on('close', () => {
      clearInterval(ping);
      realtime.remove(userId, socket);
    });
    socket.on('error', () => {
      socket.close();
    });
  });
}
