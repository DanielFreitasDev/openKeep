import websocket from '@fastify/websocket';
import { WS_PING, WS_PONG } from '@openkeep/shared';
import type { FastifyRequest } from 'fastify';
import type { App } from '../app.js';
import type { Auth, SessionUser } from '../auth/auth.js';
import type { Config } from '../config.js';
import { errors } from '../lib/errors.js';
import { toWebHeaders } from '../plugins/auth.js';
import type { Realtime } from './registry.js';

/**
 * WS endpoint: Origin and session cookie checked in `preValidation`, so a
 * rejected client gets a plain HTTP 401/403 to its upgrade request and no
 * socket is ever spoken to. One logical channel per user. Server pings every
 * 30s; dead sockets reaped. The client runs its own heartbeat on top
 * (`WS_PING`/`WS_PONG`) because browsers never surface protocol pong frames
 * to JS.
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

  // @fastify/websocket only upgrades inside the route handler, so replying
  // from a hook leaves the connection an ordinary (failed) HTTP request.
  // Session-only on purpose: a browser cannot set an Authorization header on
  // a WebSocket, so PATs have no business here.
  const authenticate = async (req: FastifyRequest): Promise<void> => {
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== appOrigin) {
      throw errors.forbidden('Forbidden origin');
    }
    const session = await auth.api.getSession({ headers: toWebHeaders(req) });
    if (!session) throw errors.unauthorized();
    req.user = session.user as SessionUser;
    req.sessionId = session.session.id;
  };

  app.get('/api/ws', { websocket: true, preValidation: authenticate }, (socket, req) => {
    const userId = req.user.id;
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

    // The socket is server→client for everything real; the only accepted
    // inbound message is the client's heartbeat probe, echoed straight back.
    socket.on('message', (raw) => {
      if (String(raw) === WS_PING) socket.send(WS_PONG);
    });

    socket.on('close', () => {
      clearInterval(ping);
      realtime.remove(userId, socket);
    });
    socket.on('error', () => {
      socket.close();
    });
  });
}
