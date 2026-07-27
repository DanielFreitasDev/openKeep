import { z } from 'zod';

export const zReminder = z.object({
  remindAt: z.iso.datetime(),
  rrule: z.string().nullable(),
  timezone: z.string(),
  snoozedUntil: z.iso.datetime().nullable(),
  done: z.boolean(),
});
export type Reminder = z.infer<typeof zReminder>;

export const zSetReminder = z.object({
  remindAt: z.iso.datetime(),
  /** RFC-5545 RRULE body; omit/null for one-shot. */
  rrule: z.string().max(500).nullish(),
  timezone: z.string().max(80),
});
export type SetReminder = z.infer<typeof zSetReminder>;

export const zSnoozeReminder = z.object({
  until: z.iso.datetime(),
});

export const zPushSubscription = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(200) }),
});
export type PushSubscriptionInput = z.infer<typeof zPushSubscription>;
