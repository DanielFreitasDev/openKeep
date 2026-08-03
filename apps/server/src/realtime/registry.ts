import type { WsEnvelope, WsEvent } from '@openkeep/shared';
import { and, eq } from 'drizzle-orm';
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

  /**
   * Second reader of the same stream: outgoing webhooks. It lives here rather
   * than at the ~40 call sites so a route that learns to publish learns to
   * fire webhooks in the same line. Must return promptly and never throw —
   * publishing to sockets is not allowed to wait on the network.
   */
  onPublish?: (userIds: string[], event: WsEvent) => void;

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
    this.onPublish?.(userIds, event);
  }
}

/** All member ids of a note — everyone who has a card to redraw. */
export async function memberIds(db: Db, noteId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: noteMembers.userId })
    .from(noteMembers)
    .where(eq(noteMembers.noteId, noteId));
  return rows.map((r) => r.userId);
}

/**
 * Members who may be told what the note now SAYS — title, body, items,
 * attachments. A member who has PROTECTED their copy is left out: the REST
 * side already refuses them the content until they re-authenticate, and an
 * event is the same content arriving by another door. They lose nothing by
 * missing it, since the copy in their cache is the redacted card either way.
 *
 * Events about the note's EXISTENCE — trashed, restored, removed, shared —
 * still use `memberIds`: a locked card must still disappear when the note does.
 */
export async function contentAudience(db: Db, noteId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: noteMembers.userId })
    .from(noteMembers)
    .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.locked, false)));
  return rows.map((r) => r.userId);
}
