import type {
  CreateWebhook,
  UpdateWebhook,
  Webhook,
  WebhookEvent,
  WebhookPayload,
} from '@openkeep/shared';
import { LIMITS } from '@openkeep/shared';
import { and, arrayContains, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { webhooks } from '../../db/schema/webhooks.js';
import { AppError, errors } from '../../lib/errors.js';
import { getNote } from '../notes/service.js';
import type { DeliveryOutcome } from './delivery.js';
import { generateWebhookSecret } from './delivery.js';

type WebhookRow = typeof webhooks.$inferSelect;

function toDto(row: WebhookRow): Webhook {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    secret: row.secret,
    createdAt: row.createdAt.toISOString(),
    lastDeliveryAt: row.lastDeliveryAt ? row.lastDeliveryAt.toISOString() : null,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
  };
}

export async function listWebhooks(db: Db, userId: string): Promise<Webhook[]> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .orderBy(desc(webhooks.createdAt), desc(webhooks.id));
  return rows.map(toDto);
}

export async function createWebhook(
  db: Db,
  userId: string,
  input: CreateWebhook,
): Promise<Webhook> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ n: count() }).from(webhooks).where(eq(webhooks.userId, userId));
    if ((row?.n ?? 0) >= LIMITS.webhooksPerUserMax) {
      throw new AppError(
        400,
        'webhook_limit_reached',
        'Webhook limit reached',
        `You can create up to ${LIMITS.webhooksPerUserMax} webhooks.`,
      );
    }
    const [created] = await tx
      .insert(webhooks)
      .values({
        userId,
        url: input.url,
        events: [...new Set(input.events)],
        secret: generateWebhookSecret(),
      })
      .returning();
    return toDto(created!);
  });
}

export async function updateWebhook(
  db: Db,
  userId: string,
  id: string,
  input: UpdateWebhook,
): Promise<Webhook> {
  const [updated] = await db
    .update(webhooks)
    .set({
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: [...new Set(input.events)] } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.rotateSecret ? { secret: generateWebhookSecret() } : {}),
    })
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .returning();
  if (!updated) throw errors.notFound();
  return toDto(updated);
}

export async function deleteWebhook(db: Db, userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .returning({ id: webhooks.id });
  if (deleted.length === 0) throw errors.notFound();
}

export async function getWebhook(db: Db, userId: string, id: string): Promise<Webhook> {
  const [row] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)))
    .limit(1);
  if (!row) throw errors.notFound();
  return toDto(row);
}

/** The webhook as the delivery job needs it — by id alone, no user in hand. */
export async function findWebhookById(db: Db, id: string): Promise<Webhook | null> {
  const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
  return row ? toDto(row) : null;
}

/** Every account with at least one live endpoint — the dispatcher's hot-path set. */
export async function subscriberIds(db: Db): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ userId: webhooks.userId })
    .from(webhooks)
    .where(eq(webhooks.enabled, true));
  return new Set(rows.map((r) => r.userId));
}

/** This user's live endpoints subscribed to `event`. */
export async function webhooksFor(
  db: Db,
  userId: string,
  event: WebhookEvent,
): Promise<{ id: string }[]> {
  return db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.userId, userId),
        eq(webhooks.enabled, true),
        arrayContains(webhooks.events, [event]),
      ),
    );
}

export async function recordAttempt(db: Db, id: string, outcome: DeliveryOutcome): Promise<void> {
  await db
    .update(webhooks)
    .set({
      lastDeliveryAt: new Date(),
      lastStatus: outcome.status,
      lastError: outcome.error,
    })
    .where(eq(webhooks.id, id));
}

/**
 * Build the body for one delivery.
 *
 * The note is read HERE, at delivery time, and through the ordinary per-user
 * read path — so the receiver gets what `GET /api/notes/:id` would give the
 * account that owns the hook, per-user state included, and never has to call
 * back. A note that is gone (or no longer visible to that account) delivers as
 * `note: null` instead of not delivering at all: `note.deleted` is exactly the
 * event whose subject no longer exists.
 */
export async function buildPayload(
  db: Db,
  userId: string,
  input: { deliveryId: string; event: WebhookEvent; noteId: string; occurredAt: string },
): Promise<WebhookPayload> {
  const note = await getNote(db, userId, input.noteId).catch(() => null);
  return {
    deliveryId: input.deliveryId,
    event: input.event,
    occurredAt: input.occurredAt,
    noteId: input.noteId,
    note,
  };
}
