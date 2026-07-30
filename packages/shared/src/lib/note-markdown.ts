/**
 * A whole note ↔ a `.md` file.
 *
 * The file is plain markdown a human (or Obsidian, or Joplin) can read: `# `
 * title, then the body — checklists as `- [ ]` / `- [x]` task items, indented
 * children under their parent. Everything the note carries that markdown has
 * no syntax for (labels, color, pin state, timestamps) rides in optional YAML
 * front matter, which the backup export writes and the importer reads back, so
 * export → import is a round trip rather than a downgrade.
 */

import { NOTE_BACKGROUNDS, type NoteBackground } from '../constants/backgrounds.js';
import { NOTE_COLORS, type NoteColor } from '../constants/colors.js';
import { LIMITS } from '../constants/limits.js';
import { renderMarkdown } from './markdown.js';
import { htmlToMarkdown } from './markdown-serialize.js';

export interface MarkdownNoteInput {
  title: string;
  type: 'text' | 'list';
  bodyHtml: string;
  items: { text: string; checked: boolean; indent: 0 | 1 }[];
}

export interface MarkdownFrontMatter {
  /** Only read on import — export puts the title in the `# ` heading. */
  title?: string;
  labels?: string[];
  color?: string;
  background?: string;
  pinned?: boolean;
  archived?: boolean;
  created?: string;
  updated?: string;
}

/** Characters no file system (or zip entry) should have to carry. */
const RESERVED_RE = /[\\/:*?"<>|]/;

const TASK_RE = /^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]*(.*)$/;

/** Quotes only what a YAML flow sequence would otherwise read as structure. */
function yamlString(value: string): string {
  return /^[\w./ -]+$/.test(value) && value.trim() === value
    ? value
    : `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function renderFrontMatter(meta: MarkdownFrontMatter): string {
  const lines: string[] = [];
  if (meta.labels && meta.labels.length > 0) {
    lines.push(`labels: [${meta.labels.map(yamlString).join(', ')}]`);
  }
  if (meta.color && meta.color !== 'default') lines.push(`color: ${meta.color}`);
  if (meta.background && meta.background !== 'none') lines.push(`background: ${meta.background}`);
  if (meta.pinned) lines.push('pinned: true');
  if (meta.archived) lines.push('archived: true');
  if (meta.created) lines.push(`created: ${meta.created}`);
  if (meta.updated) lines.push(`updated: ${meta.updated}`);
  return lines.length === 0 ? '' : `---\n${lines.join('\n')}\n---\n\n`;
}

/** Checklist items → GitHub task list, with the one indent level the model has. */
function itemsToMarkdown(items: MarkdownNoteInput['items']): string {
  return items
    .map((item) => `${item.indent === 1 ? '  ' : ''}- [${item.checked ? 'x' : ' '}] ${item.text}`)
    .join('\n');
}

/** Note → `.md` file contents. */
export function noteToMarkdown(note: MarkdownNoteInput, meta?: MarkdownFrontMatter): string {
  const parts: string[] = [];
  const front = meta ? renderFrontMatter(meta) : '';
  if (note.title.trim() !== '') parts.push(`# ${note.title.trim()}`);
  const body = note.type === 'list' ? itemsToMarkdown(note.items) : htmlToMarkdown(note.bodyHtml);
  if (body.trim() !== '') parts.push(body);
  const text = parts.join('\n\n');
  return `${front}${text}${text === '' ? '' : '\n'}`;
}

/** Comma split that respects quotes, so a label may contain a comma. */
function splitFlow(raw: string): string[] {
  const values: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const char of raw) {
    if (quote !== null) {
      if (char === quote) quote = null;
      current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.filter((value) => value.trim() !== '');
}

/** Minimal YAML: `key: scalar` and `key: [a, b]`, which is all we ever write. */
function parseFrontMatter(text: string): { meta: MarkdownFrontMatter; rest: string } {
  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!match) return { meta: {}, rest: text };
  const meta: MarkdownFrontMatter = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const entry = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!entry) continue;
    const key = (entry[1] ?? '').toLowerCase();
    const raw = (entry[2] ?? '').trim();
    const unquote = (value: string) =>
      /^["'].*["']$/.test(value) ? value.slice(1, -1).replaceAll('\\"', '"') : value;
    if (key === 'labels' || key === 'tags') {
      const list = /^\[(.*)\]$/.exec(raw);
      const values = splitFlow(list?.[1] ?? raw);
      meta.labels = values.map((v) => unquote(v.trim()).replace(/^#/, '')).filter((v) => v !== '');
    } else if (key === 'color') meta.color = unquote(raw);
    else if (key === 'background') meta.background = unquote(raw);
    else if (key === 'pinned') meta.pinned = raw === 'true';
    else if (key === 'archived') meta.archived = raw === 'true';
    else if (key === 'created' || key === 'date') meta.created = unquote(raw);
    else if (key === 'updated') meta.updated = unquote(raw);
    else if (key === 'title') meta.title = unquote(raw);
  }
  return { meta, rest: text.slice(match[0].length) };
}

export interface ParsedMarkdownNote {
  title: string;
  type: 'text' | 'list';
  bodyHtml: string;
  bodyMarkdown: string;
  items: { text: string; checked: boolean; indent: 0 | 1 }[];
  meta: MarkdownFrontMatter;
}

/**
 * `.md` file → note fields.
 *
 * The title comes from a leading `# ` heading (consumed, Obsidian-style) or
 * the file name. A file whose body is nothing but task items becomes a
 * checklist note — the shape people actually keep TODO files in — while a file
 * that merely contains some becomes a text note with the boxes as literal
 * text, because the note model has one checklist per note and no way to
 * interleave it with prose.
 */
export function parseMarkdownNote(text: string, fileName = ''): ParsedMarkdownNote {
  const { meta, rest } = parseFrontMatter(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
  const lines = rest.split('\n');

  let title = '';
  let start = 0;
  while (start < lines.length && lines[start]!.trim() === '') start++;
  const heading = /^#[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(lines[start] ?? '');
  if (meta.title !== undefined && meta.title !== '') {
    title = meta.title;
  } else if (heading) {
    title = (heading[1] ?? '').trim();
    start++;
  } else {
    title = fileName
      .replace(/\.(md|markdown|txt)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  }

  // Capped before parsing: a 200 KB file should cost a truncated note, not a
  // parse of everything followed by a truncated note.
  const body = lines
    .slice(start)
    .join('\n')
    .slice(0, LIMITS.noteBodyTextMax)
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
  const bodyLines = body === '' ? [] : body.split('\n');
  const contentLines = bodyLines.filter((line) => line.trim() !== '');
  const taskLines = contentLines.filter((line) => TASK_RE.test(line));
  const isChecklist = contentLines.length > 0 && taskLines.length === contentLines.length;

  if (isChecklist) {
    const items = taskLines.slice(0, LIMITS.itemsPerNoteMax).map((line) => {
      const [, indent = '', mark = ' ', itemText = ''] = TASK_RE.exec(line) ?? [];
      return {
        text: itemText.trim().slice(0, LIMITS.itemTextMax),
        checked: mark.toLowerCase() === 'x',
        indent: (indent.replace(/\t/g, '  ').length >= 2 ? 1 : 0) as 0 | 1,
      };
    });
    return {
      title: title.slice(0, LIMITS.noteTitleMax),
      type: 'list',
      bodyHtml: '',
      bodyMarkdown: '',
      items,
      meta,
    };
  }

  return {
    title: title.slice(0, LIMITS.noteTitleMax),
    type: 'text',
    bodyHtml: renderMarkdown(body),
    bodyMarkdown: body,
    items: [],
    meta,
  };
}

/** Front-matter color/background, narrowed to what the note model accepts. */
export function metaColor(meta: MarkdownFrontMatter): NoteColor {
  const color = meta.color as NoteColor | undefined;
  return color && (NOTE_COLORS as readonly string[]).includes(color) ? color : 'default';
}

export function metaBackground(meta: MarkdownFrontMatter): NoteBackground {
  const background = meta.background as NoteBackground | undefined;
  return background && (NOTE_BACKGROUNDS as readonly string[]).includes(background)
    ? background
    : 'none';
}

/** `My note.md` — a file name that survives zips and file systems. */
export function markdownFileName(title: string, id: string): string {
  const base = [...title.trim()]
    // Path separators, wildcards and control characters all become spaces;
    // the id suffix is what actually keeps names unique.
    .map((char) => (RESERVED_RE.test(char) || (char.codePointAt(0) ?? 0) < 0x20 ? ' ' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${base === '' ? 'note' : base}-${id.slice(0, 8)}.md`;
}
