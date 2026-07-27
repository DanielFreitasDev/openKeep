import type { WsEnvelope, WsEvent } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import type { Db } from '../db/client.js';
import { noteMembers } from '../db/schema/notes.js';

/**
 * In-process realtime registry: one logical channel per user.
 * All emission goes through publishToUsers() so a Postgres LISTEN/NOTIFY
 * transport can be dropped in later without touching call sites.
 */
export class Realtime {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  add(userId: string, socket: WebSocket): void {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socket);
  }

  remove(userId: string, socket: WebSocket): void {
    const set = this.sockets.get(userId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sockets.delete(userId);
  }

  connectionCount(userId?: string): number {
    if (userId) return this.sockets.get(userId)?.size ?? 0;
    let n = 0;
    for (const set of this.sockets.values()) n += set.size;
    return n;
  }

  publishToUsers(userIds: string[], event: WsEvent, origin?: string): void {
    const envelope: WsEnvelope = {
      type: event.type,
      ts: new Date().toISOString(),
      origin,
      payload: event.payload,
    };
    const message = JSON.stringify(envelope);
    for (const userId of new Set(userIds)) {
      const set = this.sockets.get(userId);
      if (!set) continue;
      for (const socket of set) {
        if (socket.readyState === socket.OPEN) socket.send(message);
      }
    }
  }
}

/** All member ids of a note (for content-event fan-out). */
export async function memberIds(db: Db, noteId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: noteMembers.userId })
    .from(noteMembers)
    .where(eq(noteMembers.noteId, noteId));
  return rows.map((r) => r.userId);
}
