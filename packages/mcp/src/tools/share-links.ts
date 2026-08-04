import { zId } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');

export const getShareLink = defineTool({
  name: 'get_share_link',
  description:
    "Read the note's public read-only link, if it has one. url is null when no link exists. Anyone holding the address can read the note without an account — it is the credential.",
  inputSchema: z.object({ note_id: zNoteId }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const link = await client.getShareLink(args.note_id);
    return { note_id: args.note_id, url: link.url, expires_at: link.expiresAt };
  },
});

export const createShareLink = defineTool({
  name: 'create_share_link',
  description:
    'Publish a note behind a public read-only link (owner only). Creating a link when one already exists replaces it, so the previous address stops working. Shows the shared content only — labels, reminder, pin and the member list stay private.',
  inputSchema: z.object({
    note_id: zNoteId,
    expires_in_days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .nullable()
      .optional()
      .describe('Days the link stays alive; omit or null to keep it until revoked'),
  }),
  handler: async (client, args) => {
    const link = await client.createShareLink(args.note_id, args.expires_in_days ?? null);
    return { note_id: args.note_id, url: link.url, expires_at: link.expiresAt };
  },
});

export const revokeShareLink = defineTool({
  name: 'revoke_share_link',
  description:
    'Revoke the note’s public link. The address stops working immediately and a new link is a different address.',
  inputSchema: z.object({ note_id: zNoteId }),
  annotations: { destructiveHint: true, idempotentHint: true },
  handler: async (client, args) => {
    await client.revokeShareLink(args.note_id);
    return { note_id: args.note_id, revoked: true };
  },
});
