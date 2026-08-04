import { zUserSettingsPatch } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

export const getSettings = defineTool({
  name: 'get_settings',
  description:
    'Read the account settings: checklist behavior, link previews, sharing, reminder default times, timezone, view mode, saved searches (each with the query string search_notes accepts).',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (client) => client.getSettings(),
});

export const getStorageUsage = defineTool({
  name: 'get_storage_usage',
  description:
    'How much disk this account’s attachments use, and the per-account cap this instance sets (quota_bytes null = no cap). Worth checking before a large upload — an upload past the cap is refused, not truncated.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (client) => {
    const usage = await client.getStorageUsage();
    return {
      used_bytes: usage.usedBytes,
      quota_bytes: usage.quotaBytes,
      remaining_bytes: usage.quotaBytes === null ? null : usage.quotaBytes - usage.usedBytes,
    };
  },
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
