import type { Label } from '@openkeep/shared';
import { findLabelByPath, LIMITS, labelPathMap, splitLabelPath, zId } from '@openkeep/shared';
import { z } from 'zod';
import type { OpenKeepClient } from '../client/types.js';
import { resolveLabels } from '../render.js';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
/**
 * A label **path**. Names are unique per level, not per account, so
 * `Work/Ideas` and `Personal/Ideas` are two labels and the path is what tells
 * them apart. A flat account keeps passing a bare name, as it always did.
 */
const zLabelPath = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.labelPathMax)
  .describe('Label path, e.g. "Work" or "Work/Clients/ACME" (case-insensitive)');

async function requireLabel(client: OpenKeepClient, path: string): Promise<Label> {
  const { resolved } = await resolveLabels(client, [path], { createMissing: false });
  const label = resolved[0];
  if (!label) {
    throw new Error(`No label at "${path}" — list_labels shows the existing paths.`);
  }
  return label;
}

/** The path of a label as it stands right now, for reporting back. */
async function pathOf(client: OpenKeepClient, label: Label): Promise<string> {
  return labelPathMap(await client.listLabels()).get(label.id) ?? label.name;
}

export const listLabels = defineTool({
  name: 'list_labels',
  description:
    'List all labels as paths, depth-first through the sub-label tree (a parent is followed by whatever is nested under it).',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true },
  handler: async (client) => {
    const labels = await client.listLabels();
    const paths = labelPathMap(labels);
    return {
      count: labels.length,
      labels: labels.map((l) => ({
        id: l.id,
        name: l.name,
        path: paths.get(l.id) ?? l.name,
        parent: l.parentId ? (paths.get(l.parentId) ?? null) : null,
      })),
    };
  },
});

export const createLabel = defineTool({
  name: 'create_label',
  description:
    'Create a label (max 50 per account). A path nests it — "Work/Clients" creates Clients under Work, creating Work first if needed. Names are unique among siblings, case-insensitively.',
  inputSchema: z.object({ name: zLabelPath.describe('Label path to create, e.g. "Work/Clients"') }),
  handler: async (client, args) => {
    if (splitLabelPath(args.name).length === 0) throw new Error('A label path cannot be empty.');
    const { resolved } = await resolveLabels(client, [args.name], { createMissing: true });
    const label = resolved[0];
    if (!label) throw new Error(`Could not create "${args.name}".`);
    return { id: label.id, name: label.name, path: await pathOf(client, label) };
  },
});

export const renameLabel = defineTool({
  name: 'rename_label',
  description:
    'Rename a label everywhere it is used, and/or move it in the tree. A path in new_name does both: "Work/Ideas" renames it to Ideas AND files it under Work. Its own sub-labels travel with it.',
  inputSchema: z.object({
    name: zLabelPath.describe('Current label path'),
    new_name: zLabelPath.describe('New name, or a new path to move it as well'),
  }),
  handler: async (client, args) => {
    const label = await requireLabel(client, args.name);
    const segments = splitLabelPath(args.new_name);
    const leaf = segments.at(-1);
    if (!leaf) throw new Error('A label path cannot be empty.');

    // Everything before the last segment says where it should live. Absent,
    // the label stays put — a bare new_name is a rename and nothing more.
    let parentId: string | null | undefined;
    if (segments.length > 1) {
      const parentPath = segments.slice(0, -1).join('/');
      const { resolved } = await resolveLabels(client, [parentPath], { createMissing: true });
      const parent = resolved[0];
      if (!parent) throw new Error(`Could not resolve the parent "${parentPath}".`);
      parentId = parent.id;
    }

    const renamed = await client.renameLabel(label.id, leaf, parentId);
    return { id: renamed.id, name: renamed.name, path: await pathOf(client, renamed) };
  },
});

export const deleteLabel = defineTool({
  name: 'delete_label',
  description:
    'Delete a label entirely (removed from every note; the notes themselves are untouched). Anything nested under it goes with it.',
  inputSchema: z.object({ name: zLabelPath }),
  annotations: { destructiveHint: true },
  handler: async (client, args) => {
    const all = await client.listLabels();
    const label = findLabelByPath(all, args.name);
    if (!label) {
      throw new Error(`No label at "${args.name}" — list_labels shows the existing paths.`);
    }
    const paths = labelPathMap(all);
    // Named before the delete: afterwards there is nothing left to derive them
    // from, and "what else went" is the part worth reporting.
    const prefix = `${paths.get(label.id) ?? label.name}/`;
    const nested = all
      .filter((l) => l.id !== label.id && (paths.get(l.id) ?? '').startsWith(prefix))
      .map((l) => paths.get(l.id)!);
    await client.deleteLabel(label.id);
    return {
      deleted: paths.get(label.id) ?? label.name,
      ...(nested.length > 0 ? { deleted_sub_labels: nested } : {}),
    };
  },
});

export const addLabelToNote = defineTool({
  name: 'add_label_to_note',
  description:
    'Attach a label to a note by path (case-insensitive). By default the label — and any missing parent in its path — is created when it does not exist yet.',
  inputSchema: z.object({
    note_id: zNoteId,
    label: zLabelPath,
    create_missing: z.boolean().optional().describe('Create the label when absent (default true)'),
  }),
  handler: async (client, args) => {
    const createMissing = args.create_missing ?? true;
    const { resolved, missing } = await resolveLabels(client, [args.label], { createMissing });
    const label = resolved[0];
    if (!label) {
      throw new Error(
        `No label at "${missing[0] ?? args.label}" — pass create_missing=true or use create_label.`,
      );
    }
    await client.addLabelToNote(args.note_id, label.id);
    return { note_id: args.note_id, label: await pathOf(client, label) };
  },
});

export const removeLabelFromNote = defineTool({
  name: 'remove_label_from_note',
  description: 'Detach a label from a note (the label itself is kept).',
  inputSchema: z.object({ note_id: zNoteId, label: zLabelPath }),
  handler: async (client, args) => {
    const label = await requireLabel(client, args.label);
    await client.removeLabelFromNote(args.note_id, label.id);
    return { note_id: args.note_id, removed: await pathOf(client, label) };
  },
});
