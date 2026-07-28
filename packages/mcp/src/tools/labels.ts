import type { Label } from '@openkeep/shared';
import { zId } from '@openkeep/shared';
import { z } from 'zod';
import type { OpenKeepClient } from '../client/types.js';
import { resolveLabels } from '../render.js';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
const zLabelName = z.string().trim().min(1).max(255);

async function requireLabel(client: OpenKeepClient, name: string): Promise<Label> {
  const { resolved } = await resolveLabels(client, [name], { createMissing: false });
  const label = resolved[0];
  if (!label) {
    throw new Error(`No label named "${name}" — list_labels shows the existing ones.`);
  }
  return label;
}

export const listLabels = defineTool({
  name: 'list_labels',
  description: 'List all labels (sorted by name).',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (client) => {
    const labels = await client.listLabels();
    return { count: labels.length, labels: labels.map((l) => ({ id: l.id, name: l.name })) };
  },
});

export const createLabel = defineTool({
  name: 'create_label',
  description: 'Create a label (max 50 per account, names are unique case-insensitively).',
  inputSchema: z.object({ name: zLabelName }),
  handler: async (client, args) => {
    const label = await client.createLabel(args.name);
    return { id: label.id, name: label.name };
  },
});

export const renameLabel = defineTool({
  name: 'rename_label',
  description: 'Rename a label everywhere it is used (matched by current name, case-insensitive).',
  inputSchema: z.object({
    name: zLabelName.describe('Current label name'),
    new_name: zLabelName.describe('New label name'),
  }),
  handler: async (client, args) => {
    const label = await requireLabel(client, args.name);
    const renamed = await client.renameLabel(label.id, args.new_name);
    return { id: renamed.id, name: renamed.name };
  },
});

export const deleteLabel = defineTool({
  name: 'delete_label',
  description:
    'Delete a label entirely (removed from every note; the notes themselves are untouched).',
  inputSchema: z.object({ name: zLabelName.describe('Label name (case-insensitive)') }),
  annotations: { destructiveHint: true },
  handler: async (client, args) => {
    const label = await requireLabel(client, args.name);
    await client.deleteLabel(label.id);
    return { deleted: label.name };
  },
});

export const addLabelToNote = defineTool({
  name: 'add_label_to_note',
  description:
    'Attach a label to a note by name (case-insensitive). By default the label is created when it does not exist yet.',
  inputSchema: z.object({
    note_id: zNoteId,
    label: zLabelName.describe('Label name'),
    create_missing: z.boolean().optional().describe('Create the label when absent (default true)'),
  }),
  handler: async (client, args) => {
    const createMissing = args.create_missing ?? true;
    const { resolved, missing } = await resolveLabels(client, [args.label], { createMissing });
    const label = resolved[0];
    if (!label) {
      throw new Error(
        `No label named "${missing[0] ?? args.label}" — pass create_missing=true or use create_label.`,
      );
    }
    await client.addLabelToNote(args.note_id, label.id);
    return { note_id: args.note_id, label: label.name };
  },
});

export const removeLabelFromNote = defineTool({
  name: 'remove_label_from_note',
  description: 'Detach a label from a note (the label itself is kept).',
  inputSchema: z.object({ note_id: zNoteId, label: zLabelName.describe('Label name') }),
  handler: async (client, args) => {
    const label = await requireLabel(client, args.label);
    await client.removeLabelFromNote(args.note_id, label.id);
    return { note_id: args.note_id, removed: label.name };
  },
});
