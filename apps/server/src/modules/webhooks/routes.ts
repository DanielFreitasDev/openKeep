import { randomUUID } from 'node:crypto';
import {
  WEBHOOK_TEST_EVENT,
  zCreateWebhook,
  zId,
  zUpdateWebhook,
  zWebhook,
  zWebhookTestResult,
} from '@openkeep/shared';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Config } from '../../config.js';
import type { Db } from '../../db/client.js';
import { rejectPatAuth } from '../../plugins/auth.js';
import { deliverWebhook } from './delivery.js';
import type { WebhookDispatcher } from './dispatcher.js';
import * as svc from './service.js';

const zWebhookParams = z.object({ id: zId });

/**
 * Webhook management is session-only, like personal access tokens: a token
 * that could mint an endpoint could quietly forward every note it can read to
 * a URL of its choosing. It also keeps the panel out of the MCP server, which
 * reaches these same routes with a PAT.
 */
export function registerWebhookRoutes(
  app: App,
  db: Db,
  config: Config,
  dispatcher: WebhookDispatcher,
): void {
  const auth = { preHandler: [app.requireAuth, rejectPatAuth] };
  const deliveryOpts = { allowPrivateTargets: config.WEBHOOK_ALLOW_PRIVATE_TARGETS };

  app.get(
    '/api/webhooks',
    { ...auth, schema: { tags: ['webhooks'], response: { 200: z.array(zWebhook) } } },
    async (req) => svc.listWebhooks(db, req.user.id),
  );

  app.post(
    '/api/webhooks',
    {
      ...auth,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { tags: ['webhooks'], body: zCreateWebhook, response: { 201: zWebhook } },
    },
    async (req, reply) => {
      const webhook = await svc.createWebhook(db, req.user.id, req.body);
      await dispatcher.refresh();
      return reply.status(201).send(webhook);
    },
  );

  app.patch(
    '/api/webhooks/:id',
    {
      ...auth,
      schema: {
        tags: ['webhooks'],
        params: zWebhookParams,
        body: zUpdateWebhook,
        response: { 200: zWebhook },
      },
    },
    async (req) => {
      const webhook = await svc.updateWebhook(db, req.user.id, req.params.id, req.body);
      await dispatcher.refresh();
      return webhook;
    },
  );

  app.delete(
    '/api/webhooks/:id',
    {
      ...auth,
      schema: { tags: ['webhooks'], params: zWebhookParams, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await svc.deleteWebhook(db, req.user.id, req.params.id);
      await dispatcher.refresh();
      return reply.status(204).send(null);
    },
  );

  /**
   * Delivered inline rather than queued: the answer people want is the status
   * code the receiver gave, and a queued test could only report "sent".
   */
  app.post(
    '/api/webhooks/:id/test',
    {
      ...auth,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['webhooks'],
        params: zWebhookParams,
        response: { 200: zWebhookTestResult },
      },
    },
    async (req) => {
      const webhook = await svc.getWebhook(db, req.user.id, req.params.id);
      const outcome = await deliverWebhook(
        { url: webhook.url, secret: webhook.secret },
        {
          deliveryId: randomUUID(),
          event: WEBHOOK_TEST_EVENT,
          occurredAt: new Date().toISOString(),
          noteId: null,
          note: null,
        },
        deliveryOpts,
      );
      await svc.recordAttempt(db, webhook.id, outcome);
      return outcome;
    },
  );
}
