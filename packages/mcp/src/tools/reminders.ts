import { zId } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');

export const setReminder = defineTool({
  name: 'set_reminder',
  description:
    'Set (or replace) the reminder on a note. Recurrence uses an RFC 5545 RRULE body (e.g. FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO,WE). Timezone defaults to the account setting.',
  inputSchema: z.object({
    note_id: zNoteId,
    remind_at: z.iso.datetime().describe('First occurrence, ISO 8601 (e.g. 2026-07-30T18:00:00Z)'),
    rrule: z.string().max(500).optional().describe('RFC 5545 RRULE body; omit for one-shot'),
    timezone: z
      .string()
      .max(80)
      .optional()
      .describe('IANA timezone (e.g. America/Fortaleza); defaults to the account setting'),
  }),
  handler: async (client, args) => {
    const timezone = args.timezone ?? (await client.getSettings()).timezone ?? 'UTC';
    return client.setReminder(args.note_id, {
      remindAt: args.remind_at,
      rrule: args.rrule ?? null,
      timezone,
    });
  },
});

export const removeReminder = defineTool({
  name: 'remove_reminder',
  description: 'Remove the reminder from a note.',
  inputSchema: z.object({ note_id: zNoteId }),
  handler: async (client, args) => {
    await client.deleteReminder(args.note_id);
    return { note_id: args.note_id, removed: true };
  },
});

export const snoozeReminder = defineTool({
  name: 'snooze_reminder',
  description: 'Snooze a note reminder until a specific time.',
  inputSchema: z.object({
    note_id: zNoteId,
    until: z.iso.datetime().describe('When to remind again (ISO 8601)'),
  }),
  handler: async (client, args) => client.snoozeReminder(args.note_id, args.until),
});

export const dismissReminder = defineTool({
  name: 'dismiss_reminder',
  description:
    'Dismiss the current firing of a reminder (recurring reminders advance to the next occurrence).',
  inputSchema: z.object({ note_id: zNoteId }),
  handler: async (client, args) => {
    await client.dismissReminder(args.note_id);
    return { note_id: args.note_id, dismissed: true };
  },
});
