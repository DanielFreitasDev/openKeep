import { zId } from '@openkeep/shared';
import { z } from 'zod';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');

export const listCollaborators = defineTool({
  name: 'list_collaborators',
  description: 'List everyone a note is shared with (including the owner).',
  inputSchema: z.object({ note_id: zNoteId }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const collaborators = await client.listCollaborators(args.note_id);
    return {
      collaborators: collaborators.map((c) => ({
        user_id: c.userId,
        email: c.email,
        name: c.name,
        role: c.role,
      })),
    };
  },
});

export const addCollaborator = defineTool({
  name: 'add_collaborator',
  description:
    'Share a note with another registered user by email (owner only; both accounts must have sharing enabled). Collaborators can edit content but not delete the note.',
  inputSchema: z.object({
    note_id: zNoteId,
    email: z.email().max(320).describe('Email of an existing OpenKeep account'),
  }),
  handler: async (client, args) => {
    const collaborator = await client.addCollaborator(args.note_id, args.email);
    return {
      added: { user_id: collaborator.userId, email: collaborator.email, name: collaborator.name },
    };
  },
});

export const removeCollaborator = defineTool({
  name: 'remove_collaborator',
  description:
    'Remove a collaborator from a note (by email or user_id). The owner removes others; a collaborator can remove themselves to leave the note.',
  inputSchema: z.object({
    note_id: zNoteId,
    email: z.email().optional().describe('Collaborator email (resolved via the member list)'),
    user_id: z.string().optional().describe('Collaborator user id, when already known'),
  }),
  handler: async (client, args) => {
    let userId = args.user_id;
    if (!userId) {
      if (!args.email) throw new Error('Pass email or user_id.');
      const collaborators = await client.listCollaborators(args.note_id);
      const match = collaborators.find((c) => c.email.toLowerCase() === args.email?.toLowerCase());
      if (!match) throw new Error(`No collaborator with email ${args.email} on this note.`);
      userId = match.userId;
    }
    await client.removeCollaborator(args.note_id, userId);
    return { note_id: args.note_id, removed: userId };
  },
});
