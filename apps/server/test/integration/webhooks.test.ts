import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FullNote, Webhook, WebhookPayload, WebhookTestResult } from '@openkeep/shared';
import { WEBHOOK_HEADERS } from '@openkeep/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { webhooks as webhooksTable } from '../../src/db/schema/webhooks.js';
import { webhookDeliverJob } from '../../src/jobs/index.js';
import { verifySignature } from '../../src/modules/webhooks/delivery.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

interface Received {
  headers: Record<string, string | string[] | undefined>;
  raw: string;
  payload: WebhookPayload;
}

/** A receiver that records what arrived and answers with whatever we tell it. */
function startReceiver(): Promise<{
  url: string;
  received: Received[];
  respondWith: (status: number) => void;
  close: () => Promise<void>;
}> {
  const received: Received[] = [];
  let status = 200;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      received.push({ headers: req.headers, raw, payload: JSON.parse(raw) as WebhookPayload });
      res.writeHead(status).end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/hook`,
        received,
        respondWith: (s) => {
          status = s;
        },
        close: () =>
          new Promise((done) => {
            // undici keeps the socket alive on the paths that use the global
            // dispatcher, so close() alone would wait on a live connection.
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

/** Deliveries are fired and forgotten by design — wait for the effect. */
async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for delivery');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('outgoing webhooks', () => {
  let t: TestApp;
  let cookie: string;
  /**
   * A fresh receiver per test, on its own port.
   *
   * Deliveries are fired and forgotten, so a shared recorder makes every test
   * depend on the previous one having finished delivering — which under a full
   * parallel run it sometimes had not. Its own port means a straggler lands on
   * the receiver that asked for it and can never be counted here.
   */
  let receiver: Awaited<ReturnType<typeof startReceiver>>;

  beforeAll(async () => {
    t = await createTestApp(
      // The receiver is on loopback, which is exactly what a homelab target
      // looks like — so this suite runs with the opt-in the docs describe.
      { WEBHOOK_ALLOW_PRIVATE_TARGETS: 'true' },
      ({ db, config }) => ({
        // Stands in for pg-boss: deliver inline so a test can await the effect.
        enqueueWebhook: (job) =>
          webhookDeliverJob(db, job, {
            allowPrivateTargets: config.WEBHOOK_ALLOW_PRIVATE_TARGETS,
          }),
      }),
    );
    cookie = await t.signUp('hooks@example.com', 'Hook Owner');
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    receiver = await startReceiver();
  });
  afterEach(async () => {
    // Endpoints go first: the delivery job re-reads the row, so whatever is
    // still queued stops on its own instead of chasing a closed port.
    await deleteAllWebhooks();
    await receiver.close();
  });

  const createWebhook = async (
    events: string[],
    url = receiver.url,
    extra: Record<string, string> = {},
  ) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { cookie, ...extra },
      payload: { url, events },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as Webhook;
  };

  const createNote = async (title: string) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as FullNote;
  };

  const deleteAllWebhooks = async () => {
    const list = await t.app.inject({ method: 'GET', url: '/api/webhooks', headers: { cookie } });
    for (const hook of list.json() as Webhook[]) {
      await t.app.inject({
        method: 'DELETE',
        url: `/api/webhooks/${hook.id}`,
        headers: { cookie },
      });
    }
  };

  it('delivers a signed note.created carrying the note itself', async () => {
    const hook = await createWebhook(['note.created']);
    expect(hook.secret).toMatch(/^okw_[A-Za-z0-9_-]{32}$/);

    const note = await createNote('Buy milk');
    await waitFor(() => receiver.received.length === 1);

    const delivery = receiver.received[0]!;
    expect(delivery.headers[WEBHOOK_HEADERS.event]).toBe('note.created');
    expect(delivery.headers['content-type']).toBe('application/json');
    expect(delivery.payload.event).toBe('note.created');
    expect(delivery.payload.noteId).toBe(note.id);
    // The whole promise of the payload: no call-back required.
    expect(delivery.payload.note?.title).toBe('Buy milk');
    expect(delivery.payload.deliveryId).toEqual(delivery.headers[WEBHOOK_HEADERS.delivery]);

    const timestamp = delivery.headers[WEBHOOK_HEADERS.timestamp] as string;
    const signature = delivery.headers[WEBHOOK_HEADERS.signature] as string;
    expect(verifySignature(hook.secret, timestamp, delivery.raw, signature)).toBe(true);
    // The signature is over `<timestamp>.<body>`, so a replay under another
    // stamp does not verify.
    expect(verifySignature(hook.secret, '1', delivery.raw, signature)).toBe(false);

    // The row is stamped once the receiver has answered, which is strictly
    // after it recorded the request — so poll it instead of reading it once.
    let row: typeof webhooksTable.$inferSelect | undefined;
    await waitFor(async () => {
      [row] = await t.db.select().from(webhooksTable).where(eq(webhooksTable.id, hook.id));
      return row?.lastStatus != null;
    });
    expect(row?.lastStatus).toBe(200);
    expect(row?.lastError).toBeNull();
  });

  it('sends nothing for an event the endpoint did not subscribe to', async () => {
    await createWebhook(['note.trashed']);
    const note = await createNote('Ignored on create');
    // Editing and creating are both unsubscribed; only the trash should land.
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      headers: { cookie },
      payload: { title: 'Still ignored' },
    });
    await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/trash`,
      headers: { cookie },
    });

    await waitFor(() => receiver.received.length === 1);
    expect(receiver.received[0]?.payload.event).toBe('note.trashed');
  });

  it('folds a checklist item and an edit into one "note.updated"', async () => {
    await createWebhook(['note.updated']);
    const note = await createNote('List');
    await t.app.inject({
      method: 'PATCH',
      url: `/api/notes/${note.id}`,
      headers: { cookie },
      payload: { title: 'Edited' },
    });
    await waitFor(() => receiver.received.length === 1);
    expect(receiver.received[0]?.payload.event).toBe('note.updated');
    expect(receiver.received[0]?.payload.note?.title).toBe('Edited');
  });

  it('stops delivering while disabled and resumes when switched back on', async () => {
    const hook = await createWebhook(['note.created']);
    await t.app.inject({
      method: 'PATCH',
      url: `/api/webhooks/${hook.id}`,
      headers: { cookie },
      payload: { enabled: false },
    });
    await createNote('While off');
    await new Promise((r) => setTimeout(r, 200));
    expect(receiver.received).toHaveLength(0);

    await t.app.inject({
      method: 'PATCH',
      url: `/api/webhooks/${hook.id}`,
      headers: { cookie },
      payload: { enabled: true },
    });
    await createNote('While on');
    await waitFor(() => receiver.received.length === 1);
    expect(receiver.received[0]?.payload.note?.title).toBe('While on');
  });

  it('reports the receiver status from the test button and records it', async () => {
    const hook = await createWebhook(['note.created']);
    const ok = await t.app.inject({
      method: 'POST',
      url: `/api/webhooks/${hook.id}/test`,
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json() as WebhookTestResult).toEqual({ ok: true, status: 200, error: null });
    // A test must never look like a note event to the receiver.
    expect(receiver.received.at(-1)?.payload.event).toBe('webhook.test');
    expect(receiver.received.at(-1)?.payload.note).toBeNull();

    receiver.respondWith(500);
    const failed = await t.app.inject({
      method: 'POST',
      url: `/api/webhooks/${hook.id}/test`,
      headers: { cookie },
    });
    const result = failed.json() as WebhookTestResult;
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    receiver.respondWith(200);

    const [row] = await t.db.select().from(webhooksTable).where(eq(webhooksTable.id, hook.id));
    expect(row?.lastStatus).toBe(500);
  });

  it('rotates the secret without touching the URL or the subscriptions', async () => {
    const hook = await createWebhook(['note.created']);
    const res = await t.app.inject({
      method: 'PATCH',
      url: `/api/webhooks/${hook.id}`,
      headers: { cookie },
      payload: { rotateSecret: true },
    });
    const rotated = res.json() as Webhook;
    expect(rotated.secret).not.toBe(hook.secret);
    expect(rotated.url).toBe(hook.url);
    expect(rotated.events).toEqual(hook.events);
  });

  it('refuses a URL that is not http(s) or carries credentials', async () => {
    for (const url of ['ftp://example.com/hook', 'https://user:pw@example.com/hook', 'nonsense']) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/webhooks',
        headers: { cookie },
        payload: { url, events: ['note.created'] },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('refuses webhook management via PAT', async () => {
    const token = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie },
      payload: { name: 'No webhooks' },
    });
    const bearer = { authorization: `Bearer ${token.json().token}` };

    const list = await t.app.inject({ method: 'GET', url: '/api/webhooks', headers: bearer });
    expect(list.statusCode).toBe(403);
    const create = await t.app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: bearer,
      payload: { url: receiver.url, events: ['note.created'] },
    });
    expect(create.statusCode).toBe(403);
  });

  it('keeps webhooks to their owner and enforces the per-account limit', async () => {
    // Its own forwarded IP: this test alone needs six POSTs and the route
    // allows 10/min/IP, which the tests above have already spent.
    const ip = { 'x-forwarded-for': '203.0.113.7' };
    const otherCookie = await t.signUp('hooks-other@example.com', 'Other');
    const mine = await createWebhook(['note.created'], receiver.url, ip);
    const theirs = await t.app.inject({
      method: 'GET',
      url: '/api/webhooks',
      headers: { cookie: otherCookie },
    });
    expect(theirs.json()).toEqual([]);
    const steal = await t.app.inject({
      method: 'DELETE',
      url: `/api/webhooks/${mine.id}`,
      headers: { cookie: otherCookie },
    });
    expect(steal.statusCode).toBe(404);

    // Four more reaches the cap of five.
    for (let i = 0; i < 4; i++) {
      await createWebhook(['note.created'], `${receiver.url}/${i}`, ip);
    }
    const overflow = await t.app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { cookie, ...ip },
      payload: { url: receiver.url, events: ['note.created'] },
    });
    expect(overflow.statusCode).toBe(400);
    expect(overflow.json().code).toBe('webhook_limit_reached');
  });
});

describe('outgoing webhooks without the private-target opt-in', () => {
  let t: TestApp;
  let cookie: string;
  let receiver: Awaited<ReturnType<typeof startReceiver>>;

  beforeAll(async () => {
    receiver = await startReceiver();
    t = await createTestApp();
    cookie = await t.signUp('hooks-ssrf@example.com', 'Guarded');
  });
  afterAll(async () => {
    await t.close();
    await receiver.close();
  });

  it('refuses to reach a loopback endpoint', async () => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { cookie },
      payload: { url: receiver.url, events: ['note.created'] },
    });
    // The endpoint may be stored — it is the delivery that is guarded, and the
    // instance owner can flip the env without anyone re-adding their hooks.
    expect(created.statusCode).toBe(201);

    const test = await t.app.inject({
      method: 'POST',
      url: `/api/webhooks/${(created.json() as Webhook).id}/test`,
      headers: { cookie },
    });
    const result = test.json() as WebhookTestResult;
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toContain('forbidden address');
    expect(receiver.received).toHaveLength(0);
  });
});
