import { z } from 'zod';
import { defineTool } from './types.js';

export const getCalendarFeed = defineTool({
  name: 'get_calendar_feed',
  description:
    'Read the iCalendar (.ics) subscription URL for this account’s reminders, for Google Calendar, Apple Calendar or Thunderbird. url is null when no feed has been created yet.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (client) => ({ url: (await client.getCalendarFeed()).url }),
});

export const rotateCalendarFeed = defineTool({
  name: 'rotate_calendar_feed',
  description:
    'Create the reminder calendar feed, or mint a fresh address for it. The token in the URL is the credential, so rotating breaks every calendar app already subscribed — they have to be given the new address.',
  inputSchema: z.object({}),
  handler: async (client) => ({ url: (await client.rotateCalendarFeed()).url }),
});

export const revokeCalendarFeed = defineTool({
  name: 'revoke_calendar_feed',
  description:
    'Turn the reminder calendar feed off. Subscribed calendar apps stop receiving reminders immediately.',
  inputSchema: z.object({}),
  annotations: { destructiveHint: true, idempotentHint: true },
  handler: async (client) => {
    await client.revokeCalendarFeed();
    return { revoked: true };
  },
});
