import { z } from 'zod';
import { labelMap, noteCard } from '../render.js';
import { defineTool } from './types.js';

export const searchNotes = defineTool({
  name: 'search_notes',
  description:
    'Full-text search across notes (title, body, checklist items) with optional filters. Returns compact cards; `headline` highlights the match. Archived notes are included, trashed are not.',
  inputSchema: z.object({
    q: z.string().max(500).optional().describe('Search terms (prefix matching)'),
    type: z
      .enum(['list', 'url', 'image', 'audio', 'drawing', 'reminder'])
      .optional()
      .describe(
        'Only notes of a kind: checklists, with links, with images/audio/drawings, with reminders',
      ),
    label: z.string().optional().describe('Only notes carrying this label (name)'),
    color: z.string().optional().describe('Only notes with this color'),
    collaborator: z
      .string()
      .optional()
      .describe('Only notes shared with this person (user id, as returned by list_collaborators)'),
  }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const [results, labels] = await Promise.all([
      client.search({
        q: args.q,
        type: args.type,
        label: args.label,
        color: args.color,
        collaborator: args.collaborator,
      }),
      labelMap(client),
    ]);
    return {
      count: results.length,
      notes: results.map((n) => {
        const card = noteCard(n, labels);
        if (n.headline) card.headline = n.headline;
        return card;
      }),
    };
  },
});
