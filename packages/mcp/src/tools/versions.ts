import { zId } from '@openkeep/shared';
import { z } from 'zod';
import { labelMap, noteRender } from '../render.js';
import { defineTool } from './types.js';

const zNoteId = zId.describe('Note id (uuid)');
const zVersionId = zId.describe('Version id (uuid)');

export const listNoteVersions = defineTool({
  name: 'list_note_versions',
  description:
    'List the saved version snapshots of a note (newest first; up to 50 are kept per note).',
  inputSchema: z.object({ note_id: zNoteId }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const versions = await client.listVersions(args.note_id);
    return {
      count: versions.length,
      versions: versions.map((v) => ({ id: v.id, created_at: v.createdAt })),
    };
  },
});

export const getNoteVersion = defineTool({
  name: 'get_note_version',
  description: 'Read the plain-text content of one version snapshot of a note.',
  inputSchema: z.object({ note_id: zNoteId, version_id: zVersionId }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => client.downloadVersion(args.note_id, args.version_id),
});

export const restoreNoteVersion = defineTool({
  name: 'restore_note_version',
  description:
    'Restore a note to a previous version (the current state is snapshotted first, so the restore itself is undoable).',
  inputSchema: z.object({ note_id: zNoteId, version_id: zVersionId }),
  handler: async (client, args) => {
    const note = await client.restoreVersion(args.note_id, args.version_id);
    const labels = await labelMap(client);
    return noteRender(note, labels);
  },
});
