/**
 * Per-tab client id. Sent as X-Client-Id with every mutation; the server
 * echoes it as `origin` on WebSocket events so this tab can drop its own
 * echoes (see docs/ARCHITECTURE.md, realtime).
 */
export const clientId = crypto.randomUUID();
