import { z } from 'zod';
import { zId } from './common.js';
import { zFullNote } from './notes.js';

/**
 * The outbound vocabulary — deliberately much smaller than the WebSocket's.
 *
 * A socket talks to our own client, which ships with the server and can be
 * taught a new event name on the same day. A webhook talks to somebody's n8n
 * flow, so every name here is a promise to a stranger: it has to survive our
 * refactors. That is why these are note-level facts ("this note changed")
 * rather than the twenty internal events that cause them — an attachment
 * upload, a checklist item, a paste into the body are all one thing to an
 * automation, and none of them should leak the shape of our patch results.
 */
export const WEBHOOK_EVENTS = [
  'note.created',
  /** Shared content: title, body, items, attachments, note type. */
  'note.updated',
  /** This account's own state on the note: pin, archive, color, labels, reminder. */
  'note.state_changed',
  'note.trashed',
  'note.restored',
  'note.deleted',
  /**
   * The one event that is not a change somebody made: the reminder came due.
   * It rides along because the job that fires reminders already announces it
   * on the same channel, and "when my reminder goes off, do X" is the reason
   * most people wire a note app to anything at all.
   */
  'reminder.fired',
] as const;

export const zWebhookEvent = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof zWebhookEvent>;

/**
 * What the "Send test" button delivers. Not in the subscribable list on
 * purpose: a test that arrived as `note.created` would be a working automation
 * firing on a note that was never created.
 */
export const WEBHOOK_TEST_EVENT = 'webhook.test';

/**
 * http as well as https: the target of a self-hosted webhook is routinely a
 * box on the same LAN (`http://homeassistant.local:8123`), and refusing that
 * would refuse the whole reason the feature exists. Whether such an address is
 * reachable at all is the deploy's call — see WEBHOOK_ALLOW_PRIVATE_TARGETS.
 */
export const zWebhookUrl = z
  .url({ protocol: /^https?$/ })
  .max(2000)
  // `https://user:pass@host/` would put a credential in a field we display and
  // log; the SSRF guard refuses it too, but only on the paths it runs on.
  .refine((value) => !/^https?:\/\/[^/?#]*@/.test(value), 'credentials in the URL are not allowed');

export const zWebhook = z.object({
  id: zId,
  url: z.string(),
  events: z.array(zWebhookEvent),
  enabled: z.boolean(),
  /**
   * The HMAC key, in the clear — the receiver needs it to verify and we need
   * it to sign, so unlike a personal access token it cannot be a hash.
   */
  secret: z.string(),
  createdAt: z.iso.datetime(),
  /** Last attempt, for the "is this thing on?" line in the UI. */
  lastDeliveryAt: z.iso.datetime().nullable(),
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
});
export type Webhook = z.infer<typeof zWebhook>;

export const zCreateWebhook = z.object({
  url: zWebhookUrl,
  events: z.array(zWebhookEvent).min(1).max(WEBHOOK_EVENTS.length),
});
export type CreateWebhook = z.infer<typeof zCreateWebhook>;

export const zUpdateWebhook = z
  .object({
    url: zWebhookUrl,
    events: z.array(zWebhookEvent).min(1).max(WEBHOOK_EVENTS.length),
    enabled: z.boolean(),
    /** Rotate the signing key; every receiver has to be told the new one. */
    rotateSecret: z.literal(true),
  })
  .partial();
export type UpdateWebhook = z.infer<typeof zUpdateWebhook>;

/**
 * The result of the "Send test" button. Delivered inline rather than queued:
 * the whole point is to hand back the status code the receiver answered with,
 * and a fire-and-forget test would only be able to say "sent".
 */
export const zWebhookTestResult = z.object({
  ok: z.boolean(),
  status: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type WebhookTestResult = z.infer<typeof zWebhookTestResult>;

/**
 * The JSON body a receiver gets.
 *
 * `note` is the note as `GET /api/notes/:id` would return it *to the account
 * that owns the webhook*, read at delivery time — so an automation never has
 * to call back, and per-user state (labels, reminder, pin) is the state of the
 * person who asked for the hook. It is null only when the note is gone by the
 * time we deliver, which is the normal case for `note.deleted`.
 */
export const zWebhookPayload = z.object({
  /** Unique per attempt-chain; retries of the same event repeat it. */
  deliveryId: z.string(),
  event: z.union([zWebhookEvent, z.literal(WEBHOOK_TEST_EVENT)]),
  occurredAt: z.iso.datetime(),
  noteId: zId.nullable(),
  note: zFullNote.nullable(),
});
export type WebhookPayload = z.infer<typeof zWebhookPayload>;

/** Header names, shared so the docs, the sender and the tests agree. */
export const WEBHOOK_HEADERS = {
  event: 'x-openkeep-event',
  delivery: 'x-openkeep-delivery',
  timestamp: 'x-openkeep-timestamp',
  signature: 'x-openkeep-signature',
} as const;
