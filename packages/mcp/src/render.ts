import type { FullNote, Label, Reminder } from '@openkeep/shared';
import {
  findLabelByPath,
  htmlToMarkdown,
  htmlToPlainText,
  labelPathMap,
  splitLabelPath,
} from '@openkeep/shared';
import { OpenKeepApiError } from './client/errors.js';
import type { OpenKeepClient } from './client/types.js';

const SNIPPET_MAX = 200;

/** Compact projection for list/search results — empty fields omitted to save tokens. */
export interface NoteCard {
  id: string;
  type: 'text' | 'list';
  title?: string;
  snippet?: string;
  color?: string;
  background?: string;
  pinned?: true;
  archived?: true;
  trashed?: true;
  labels?: string[];
  items_total?: number;
  items_checked?: number;
  attachments?: number;
  reminder_at?: string;
  shared?: true;
  headline?: string;
  updated_at: string;
}

export interface RenderedNote {
  id: string;
  type: 'text' | 'list';
  title: string;
  /**
   * The body as markdown — the default tool surface. Formatting an agent
   * writes back in the same syntax survives the round trip (the note itself
   * speaks markdown), and an unformatted note reads exactly like plain text.
   */
  markdown?: string;
  /** Only with `include_html`. */
  body_html?: string;
  items?: { id: string; text: string; checked: boolean; indent: 0 | 1 }[];
  labels?: string[];
  color?: string;
  background?: string;
  pinned?: true;
  archived?: true;
  trashed_at?: string;
  reminder?: Reminder;
  attachments?: { id: string; kind: string; mime: string }[];
  collaborators?: { email: string; name: string; role: string }[];
  role?: string;
  has_links?: true;
  created_at: string;
  updated_at: string;
}

function labelNamesOf(note: FullNote, labels: ReadonlyMap<string, string>): string[] {
  return note.labelIds.map((id) => labels.get(id)).filter((n): n is string => n !== undefined);
}

function snippetOf(note: FullNote): string | undefined {
  const source =
    note.type === 'list'
      ? note.items
          .slice(0, 6)
          .map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`)
          .join('\n')
      : htmlToPlainText(note.bodyHtml);
  if (source === '') return undefined;
  return source.length > SNIPPET_MAX ? `${source.slice(0, SNIPPET_MAX)}…` : source;
}

/**
 * Map of labelId → **path** for projecting labelIds into something an agent
 * can hand straight back to a tool. Names are only unique among siblings, so
 * `Work/Ideas` is the identifier; a root label's path is just its name, which
 * is what a flat account has always seen.
 */
export async function labelMap(client: OpenKeepClient): Promise<Map<string, string>> {
  return labelPathMap(await client.listLabels());
}

export function noteCard(note: FullNote, labels: ReadonlyMap<string, string>): NoteCard {
  const names = labelNamesOf(note, labels);
  const checked = note.items.filter((i) => i.checked).length;
  const card: NoteCard = { id: note.id, type: note.type, updated_at: note.updatedAt };
  if (note.title !== '') card.title = note.title;
  const snippet = snippetOf(note);
  if (snippet !== undefined) card.snippet = snippet;
  if (note.color !== 'default') card.color = note.color;
  if (note.background !== 'none') card.background = note.background;
  if (note.pinned) card.pinned = true;
  if (note.archived) card.archived = true;
  if (note.trashedAt !== null) card.trashed = true;
  if (names.length > 0) card.labels = names;
  if (note.items.length > 0) {
    card.items_total = note.items.length;
    card.items_checked = checked;
  }
  if (note.attachments.length > 0) card.attachments = note.attachments.length;
  if (note.reminder) card.reminder_at = note.reminder.snoozedUntil ?? note.reminder.remindAt;
  if (note.collaborators.length > 1) card.shared = true;
  return card;
}

export function noteRender(
  note: FullNote,
  labels: ReadonlyMap<string, string>,
  opts: { includeHtml?: boolean } = {},
): RenderedNote {
  const rendered: RenderedNote = {
    id: note.id,
    type: note.type,
    title: note.title,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
  if (note.type === 'text') {
    rendered.markdown = htmlToMarkdown(note.bodyHtml);
  } else {
    // Items arrive ordered by fractional position; position itself is
    // omitted (drag-reorder is a UI concern, not a tool concern).
    rendered.items = note.items.map((i) => ({
      id: i.id,
      text: i.text,
      checked: i.checked,
      indent: i.indent,
    }));
  }
  if (opts.includeHtml) rendered.body_html = note.bodyHtml;
  const names = labelNamesOf(note, labels);
  if (names.length > 0) rendered.labels = names;
  if (note.color !== 'default') rendered.color = note.color;
  if (note.background !== 'none') rendered.background = note.background;
  if (note.pinned) rendered.pinned = true;
  if (note.archived) rendered.archived = true;
  if (note.trashedAt !== null) rendered.trashed_at = note.trashedAt;
  if (note.reminder) rendered.reminder = note.reminder;
  if (note.attachments.length > 0) {
    rendered.attachments = note.attachments.map((a) => ({ id: a.id, kind: a.kind, mime: a.mime }));
  }
  if (note.collaborators.length > 1) {
    rendered.collaborators = note.collaborators.map((c) => ({
      email: c.email,
      name: c.name,
      role: c.role,
    }));
    rendered.role = note.role;
  }
  if (note.hasLinks) rendered.has_links = true;
  return rendered;
}

/**
 * Case-insensitive label resolution by **path** (`Work/Clients/ACME`). With
 * `createMissing`, absent labels are created — the whole chain, one segment at
 * a time, because a leaf cannot exist without its ancestors. Races on
 * `label_exists` re-resolve instead of failing.
 */
export async function resolveLabels(
  client: OpenKeepClient,
  paths: string[],
  opts: { createMissing: boolean },
): Promise<{ resolved: Label[]; missing: string[] }> {
  let existing = await client.listLabels();
  const resolved: Label[] = [];
  const missing: string[] = [];

  /** One segment under a known parent, creating it if allowed. */
  const step = async (name: string, parentId: string | null): Promise<Label | undefined> => {
    const sibling = (l: Label) =>
      l.parentId === parentId && l.name.toLowerCase() === name.toLowerCase();
    const found = existing.find(sibling);
    if (found) return found;
    try {
      const created = await client.createLabel(name, parentId);
      existing = [...existing, created];
      return created;
    } catch (err) {
      if (err instanceof OpenKeepApiError && err.code === 'label_exists') {
        existing = await client.listLabels();
        return existing.find(sibling);
      }
      throw err;
    }
  };

  for (const path of paths) {
    const trimmed = path.trim();
    if (trimmed === '') continue;

    const found = findLabelByPath(existing, trimmed);
    if (found) {
      resolved.push(found);
      continue;
    }
    if (!opts.createMissing) {
      missing.push(trimmed);
      continue;
    }

    let parentId: string | null = null;
    let leaf: Label | undefined;
    for (const segment of splitLabelPath(trimmed)) {
      leaf = await step(segment, parentId);
      if (!leaf) break;
      parentId = leaf.id;
    }
    if (leaf) resolved.push(leaf);
    else missing.push(trimmed);
  }
  return { resolved, missing };
}
