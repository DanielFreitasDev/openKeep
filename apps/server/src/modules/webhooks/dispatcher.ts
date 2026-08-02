import { randomUUID } from 'node:crypto';
import type { WebhookEvent, WsEvent } from '@openkeep/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../db/client.js';
import { toWebhookEvent } from './events.js';
import { subscriberIds, webhooksFor } from './service.js';

/** What one queued delivery needs to know; the note itself is read on arrival. */
export interface WebhookJob {
  webhookId: string;
  userId: string;
  event: WebhookEvent;
  noteId: string;
  occurredAt: string;
  deliveryId: string;
}

export type EnqueueWebhook = (job: WebhookJob) => Promise<void>;

/**
 * Turns realtime events into queued deliveries.
 *
 * It hangs off the single point that already fans out to every interested
 * user (`Realtime.publishToUsers`), so a route that learns to publish learns
 * to fire webhooks in the same line — there is no second list of "events that
 * also notify" to keep in step.
 *
 * The hot path may not pay for a query. Every keystroke's autosave publishes,
 * and almost no instance has a webhook at all, so the set of accounts with a
 * live endpoint is held in memory and refreshed whenever that set can change.
 * Like the realtime registry itself, this assumes one server process — the
 * same assumption, in the same place.
 */
export class WebhookDispatcher {
  private subscribers = new Set<string>();

  constructor(
    private readonly db: Db,
    private readonly enqueue: EnqueueWebhook,
    private readonly log: FastifyBaseLogger,
  ) {}

  async refresh(): Promise<void> {
    this.subscribers = await subscriberIds(this.db);
  }

  /** Sync by contract: `publishToUsers` returns void and must not await us. */
  readonly publish = (userIds: string[], event: WsEvent): void => {
    if (this.subscribers.size === 0) return;
    const mapped = toWebhookEvent(event);
    if (!mapped) return;
    const targets = [...new Set(userIds)].filter((id) => this.subscribers.has(id));
    if (targets.length === 0) return;

    const occurredAt = new Date().toISOString();
    void this.fanOut(targets, mapped, occurredAt).catch((err) => {
      this.log.error({ err }, 'webhook fan-out failed');
    });
  };

  private async fanOut(
    userIds: string[],
    mapped: NonNullable<ReturnType<typeof toWebhookEvent>>,
    occurredAt: string,
  ): Promise<void> {
    for (const userId of userIds) {
      const hooks = await webhooksFor(this.db, userId, mapped.event);
      for (const hook of hooks) {
        await this.enqueue({
          webhookId: hook.id,
          userId,
          event: mapped.event,
          noteId: mapped.noteId,
          occurredAt,
          deliveryId: randomUUID(),
        });
      }
    }
  }
}
