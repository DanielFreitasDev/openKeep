import { zUserSettingsPatch } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

export const getSettings = defineTool({
  name: 'get_settings',
  description:
    'Read the account settings: checklist behavior, link previews, sharing, reminder default times, timezone, view mode.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (client) => client.getSettings(),
});

export const updateSettings = defineTool({
  name: 'update_settings',
  description:
    'Change account settings (any subset). Times are HH:MM 24h; timezone is IANA (e.g. America/Fortaleza).',
  // Field names mirror the REST/UI schema (camelCase) so docs line up.
  inputSchema: z.object(zUserSettingsPatch.shape),
  handler: async (client, args) => {
    if (Object.keys(args).length === 0) {
      throw new Error('Nothing to change — pass at least one setting.');
    }
    return client.updateSettings(args);
  },
});
