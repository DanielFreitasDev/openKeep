import {
  NOTE_BACKGROUNDS,
  NOTE_COLORS,
  plainTextToHtml,
  renderMarkdown,
  zId,
} from '@openkeep/shared';
import { z } from 'zod';
import { labelMap, noteCard, noteRender, resolveLabels } from '../render.js';
import { defineTool } from './types.js';

const zNoteColor = z.enum(NOTE_COLORS).describe('Note color');
const zNoteBackground = z.enum(NOTE_BACKGROUNDS).describe('Note background pattern');
const zNoteId = zId.describe('Note id (uuid)');
const zIncludeHtml = z
  .boolean()
  .optional()
  .describe(
    'Also return the note body as sanitized HTML (headings, p, br, strong, em, u, s, code, pre, blockquote, ul, ol, li, hr, a)',
  );

const zMarkdown = z
  .string()
  .optional()
  .describe(
    'Markdown body — headings, bold/italic/strikethrough, code, quotes, rules, lists and links all round-trip',
  );

const zItemInput = z.object({
  text: z.string().max(1000).describe('Checklist item text'),
  checked: z.boolean().optional().describe('Checked state (default false)'),
  indent: z
    .union([z.literal(0), z.literal(1)])
    .optional()
    .describe('0 = top level, 1 = indented under the item above'),
});

/**
 * Body precedence: explicit `body_html`, then `markdown`, then plain `text`.
 * Markdown is the surface agents should reach for — it is what `get_note`
 * hands back, so read → edit → write keeps the formatting.
 */
function bodyHtmlFrom(args: {
  text?: string | undefined;
  markdown?: string | undefined;
  body_html?: string | undefined;
}) {
  if (args.body_html !== undefined) return args.body_html;
  if (args.markdown !== undefined) return renderMarkdown(args.markdown);
  if (args.text !== undefined) return plainTextToHtml(args.text);
  return undefined;
}

export const listNotes = defineTool({
  name: 'list_notes',
  description:
    'List notes as compact cards (id, title, snippet, labels, state). Default view is "active"; use view=archived, view=trash or view=templates for the other sections. Use get_note for full content.',
  inputSchema: z.object({
    view: z
      .enum(['active', 'archived', 'trash', 'templates'])
      .optional()
      .describe('Which section to list (default active)'),
    label: z.string().optional().describe('Only notes carrying this label (case-insensitive name)'),
  }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const [notes, labels] = await Promise.all([
      client.listNotes({ view: args.view ?? 'active', label: args.label }),
      labelMap(client),
    ]);
    return { count: notes.length, notes: notes.map((n) => noteCard(n, labels)) };
  },
});

export const getNote = defineTool({
  name: 'get_note',
  description:
    'Read one note in full: markdown body (or checklist items), labels, reminder, attachments, collaborators.',
  inputSchema: z.object({ note_id: zNoteId, include_html: zIncludeHtml }),
  annotations: { readOnlyHint: true },
  handler: async (client, args) => {
    const [note, labels] = await Promise.all([client.getNote(args.note_id), labelMap(client)]);
    return noteRender(note, labels, { includeHtml: args.include_html ?? false });
  },
});

export const createNote = defineTool({
  name: 'create_note',
  description:
    'Create a note in one call: content (markdown, plain text or checklist items), color, pin, labels (created if missing), reminder and archived state. On partial failure the note is still created and `warnings` lists what to fix with which tool.',
  inputSchema: z.object({
    title: z.string().max(999).optional().describe('Note title'),
    text: z
      .string()
      .optional()
      .describe('Plain-text body (for text notes); lines become paragraphs'),
    markdown: zMarkdown,
    body_html: z
      .string()
      .optional()
      .describe('Sanitized HTML body — only when neither markdown nor plain text fits'),
    items: z
      .array(zItemInput)
      .max(100)
      .optional()
      .describe('Checklist items — the note becomes a list note'),
    pinned: z.boolean().optional(),
    color: zNoteColor.optional(),
    background: zNoteBackground.optional(),
    labels: z
      .array(z.string().min(1).max(255))
      .max(10)
      .optional()
      .describe('Label names to attach (created when missing)'),
    reminder: z
      .object({
        remind_at: z.iso.datetime().describe('When to remind (ISO 8601)'),
        rrule: z
          .string()
          .max(500)
          .optional()
          .describe('RFC 5545 RRULE body for recurrence, e.g. FREQ=WEEKLY;BYDAY=MO'),
        timezone: z
          .string()
          .max(80)
          .optional()
          .describe('IANA timezone; defaults to the account setting'),
      })
      .optional(),
    archived: z.boolean().optional().describe('Create directly in the archive'),
  }),
  handler: async (client, args) => {
    const warnings: string[] = [];
    const note = await client.createNote({
      type: args.items && args.items.length > 0 ? 'list' : 'text',
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(bodyHtmlFrom(args) !== undefined ? { bodyHtml: bodyHtmlFrom(args) } : {}),
      ...(args.items ? { items: args.items } : {}),
      ...(args.pinned !== undefined ? { pinned: args.pinned } : {}),
      ...(args.color !== undefined ? { color: args.color } : {}),
      ...(args.background !== undefined ? { background: args.background } : {}),
    });

    // Follow-ups run best-effort, in order, without rollback: the note exists
    // and each warning names the tool that finishes the job.
    if (args.labels && args.labels.length > 0) {
      try {
        const { resolved } = await resolveLabels(client, args.labels, { createMissing: true });
        for (const label of resolved) await client.addLabelToNote(note.id, label.id);
      } catch (err) {
        warnings.push(
          `Labels were not attached (${String((err as Error).message)}); use add_label_to_note.`,
        );
      }
    }
    if (args.reminder) {
      try {
        const timezone = args.reminder.timezone ?? (await client.getSettings()).timezone ?? 'UTC';
        await client.setReminder(note.id, {
          remindAt: args.reminder.remind_at,
          rrule: args.reminder.rrule ?? null,
          timezone,
        });
      } catch (err) {
        warnings.push(
          `Reminder was not set (${String((err as Error).message)}); use set_reminder.`,
        );
      }
    }
    if (args.archived) {
      try {
        await client.patchNoteState(note.id, { archived: true });
      } catch (err) {
        warnings.push(
          `Note was not archived (${String((err as Error).message)}); use set_note_state.`,
        );
      }
    }

    const [fresh, labels] = await Promise.all([client.getNote(note.id), labelMap(client)]);
    return warnings.length > 0
      ? { note: noteRender(fresh, labels), warnings }
      : { note: noteRender(fresh, labels) };
  },
});

export const updateNote = defineTool({
  name: 'update_note',
  description:
    'Update a note title and/or body. Body accepts `markdown` (the same syntax get_note returns), plain `text`, or `body_html`. Checklist items are edited with the checklist tools instead.',
  inputSchema: z.object({
    note_id: zNoteId,
    title: z.string().max(999).optional(),
    text: z.string().optional().describe('New plain-text body (replaces the old body)'),
    markdown: zMarkdown,
    body_html: z.string().optional().describe('New sanitized-HTML body (overrides the others)'),
  }),
  handler: async (client, args) => {
    const bodyHtml = bodyHtmlFrom(args);
    if (args.title === undefined && bodyHtml === undefined) {
      throw new Error('Nothing to update — pass title, markdown, text or body_html.');
    }
    const result = await client.patchNoteContent(args.note_id, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(bodyHtml !== undefined ? { bodyHtml } : {}),
    });
    const [note, labels] = await Promise.all([client.getNote(result.id), labelMap(client)]);
    return noteRender(note, labels);
  },
});

export const setNoteState = defineTool({
  name: 'set_note_state',
  description:
    'Pin/unpin, archive/unarchive, save as (or unsave from) a template, or change the color/background of a note.',
  inputSchema: z.object({
    note_id: zNoteId,
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    is_template: z
      .boolean()
      .optional()
      .describe('Move the note onto (or off) the templates shelf — it leaves every other view'),
    color: zNoteColor.optional(),
    background: zNoteBackground.optional(),
  }),
  handler: async (client, args) => {
    const { note_id, is_template, ...rest } = args;
    const patch = { ...rest, ...(is_template === undefined ? {} : { isTemplate: is_template }) };
    if (Object.keys(patch).length === 0) {
      throw new Error(
        'Nothing to change — pass pinned, archived, is_template, color or background.',
      );
    }
    return client.patchNoteState(note_id, patch);
  },
});

export const trashNote = defineTool({
  name: 'trash_note',
  description:
    'Move a note to the trash (kept 7 days, then purged). Trashed notes are read-only until restored.',
  inputSchema: z.object({ note_id: zNoteId }),
  handler: async (client, args) => {
    const note = await client.trashNote(args.note_id);
    return { id: note.id, trashed_at: note.trashedAt };
  },
});

export const restoreNote = defineTool({
  name: 'restore_note',
  description: 'Restore a note from the trash, making it editable again.',
  inputSchema: z.object({ note_id: zNoteId }),
  handler: async (client, args) => {
    const note = await client.restoreNote(args.note_id);
    return { id: note.id, restored: true };
  },
});

export const deleteNoteForever = defineTool({
  name: 'delete_note_forever',
  description:
    'Permanently delete a TRASHED note (irreversible). The note must already be in the trash — call trash_note first.',
  inputSchema: z.object({ note_id: zNoteId }),
  annotations: { destructiveHint: true },
  handler: async (client, args) => {
    await client.deleteNoteForever(args.note_id);
    return { id: args.note_id, deleted: true };
  },
});

export const emptyTrash = defineTool({
  name: 'empty_trash',
  description: 'Permanently delete ALL notes in the trash (irreversible).',
  inputSchema: z.object({}),
  annotations: { destructiveHint: true },
  handler: async (client) => client.emptyTrash(),
});

export const copyNote = defineTool({
  name: 'copy_note',
  description:
    'Duplicate a note (content, items, color, my labels). Pin, collaborators and reminders are not copied.',
  inputSchema: z.object({ note_id: zNoteId }),
  handler: async (client, args) => {
    const copy = await client.copyNote(args.note_id);
    const labels = await labelMap(client);
    return noteRender(copy, labels);
  },
});

export const convertNote = defineTool({
  name: 'convert_note',
  description:
    'Convert between text note and checklist. text→list: body lines become unchecked items. list→text: item texts join as lines (checked state is lost).',
  inputSchema: z.object({ note_id: zNoteId, to: z.enum(['text', 'list']) }),
  handler: async (client, args) => {
    const note = await client.convertNote(args.note_id, args.to);
    const labels = await labelMap(client);
    return noteRender(note, labels);
  },
});
