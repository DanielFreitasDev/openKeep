import type { OpenKeepClient } from './client/types.js';
import { labelMap, noteCard, noteRender } from './render.js';

/** JSON body of the `openkeep://notes` resource (active-note cards). */
export async function notesListResource(client: OpenKeepClient): Promise<string> {
  const [notes, labels] = await Promise.all([
    client.listNotes({ view: 'active' }),
    labelMap(client),
  ]);
  return JSON.stringify({ count: notes.length, notes: notes.map((n) => noteCard(n, labels)) });
}

/** JSON body of an `openkeep://notes/{id}` resource (full rendered note). */
export async function noteResource(client: OpenKeepClient, id: string): Promise<string> {
  const [note, labels] = await Promise.all([client.getNote(id), labelMap(client)]);
  return JSON.stringify(noteRender(note, labels));
}
