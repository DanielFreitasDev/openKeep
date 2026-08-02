import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { WebhookPayload } from '@openkeep/shared';
import { WEBHOOK_HEADERS } from '@openkeep/shared';
import { Agent, request } from 'undici';
import { resolvePinned } from '../../lib/ssrf-guard.js';

const TIMEOUT_MS = 10_000;
/** Enough of the receiver's answer to debug with; never enough to be a fetch oracle. */
const ERROR_MAX = 200;

/** 32 bytes of base64url — the same shape as the calendar-feed token. */
export function generateWebhookSecret(): string {
  return `okw_${randomBytes(24).toString('base64url')}`;
}

/**
 * The signed string is `<timestamp>.<body>`, not the body alone: a signature
 * over the body only is replayable forever, and the receiver has no way to
 * tell a delivery from a recording of one.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time compare, exported for receivers written against our tests. */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = Buffer.from(`sha256=${signPayload(secret, timestamp, body)}`);
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface DeliveryOutcome {
  ok: boolean;
  status: number | null;
  error: string | null;
}

export interface DeliveryOptions {
  /**
   * Whether a private/loopback/link-local target may be reached. Off by
   * default — on a multi-user instance any account could otherwise aim a hook
   * at the metadata service or a neighbour container. A single-user box turns
   * it on, because `http://homeassistant.local:8123` is the entire point.
   */
  allowPrivateTargets: boolean;
}

function pinnedAgent(address: string, family: 4 | 6): Agent {
  return new Agent({
    connect: {
      // Same rebinding defense as the link-preview fetcher: the socket goes to
      // the address we validated, whatever DNS says a millisecond later.
      lookup: (_host, _opts, cb) => cb(null, [{ address, family }]),
      timeout: TIMEOUT_MS,
    },
  });
}

/**
 * POST one payload and report what came back.
 *
 * Redirects are not followed: a 30x is a misconfigured endpoint, and chasing
 * it would re-open the SSRF question one hop past the address we pinned. The
 * response body is dropped unread — the receiver's answer is a status code to
 * us, and reading it would turn a webhook into a way to fetch a page.
 */
export async function deliverWebhook(
  target: { url: string; secret: string },
  payload: WebhookPayload,
  opts: DeliveryOptions,
): Promise<DeliveryOutcome> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'OpenKeep-Webhook/1.0 (+self-hosted)',
    [WEBHOOK_HEADERS.event]: payload.event,
    [WEBHOOK_HEADERS.delivery]: payload.deliveryId,
    [WEBHOOK_HEADERS.timestamp]: timestamp,
    [WEBHOOK_HEADERS.signature]: `sha256=${signPayload(target.secret, timestamp, body)}`,
  };

  let agent: Agent | undefined;
  try {
    let url = target.url;
    if (!opts.allowPrivateTargets) {
      const pinned = await resolvePinned(target.url);
      agent = pinnedAgent(pinned.target.address, pinned.target.family);
      url = pinned.url.toString();
    }
    const res = await request(url, {
      ...(agent ? { dispatcher: agent } : {}),
      method: 'POST',
      headers,
      body,
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    });
    await res.body.dump({ limit: 4096 }).catch(() => {});
    const ok = res.statusCode >= 200 && res.statusCode < 300;
    return {
      ok,
      status: res.statusCode,
      error: ok ? null : `endpoint answered ${res.statusCode}`,
    };
  } catch (err) {
    return { ok: false, status: null, error: String((err as Error).message).slice(0, ERROR_MAX) };
  } finally {
    await agent?.close().catch(() => {});
  }
}
