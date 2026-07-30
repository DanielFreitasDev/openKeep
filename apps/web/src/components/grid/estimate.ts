import type { FullNote } from '@openkeep/shared';

/**
 * Predicted card height, used to place a card the grid has not rendered yet.
 *
 * The grid only mounts the cards near the viewport, so most rows are laid out
 * from this guess and corrected by the ResizeObserver once they scroll in. It
 * only has to be close — a good guess keeps the scrollbar honest and the
 * correction invisible; a flat constant would make the page grow under the
 * user as they scroll.
 *
 * Numbers mirror NoteCard's box model (see the class names quoted per line).
 */

/** `text-[1.1875rem] leading-7`, `mb-1.5`. */
const TITLE_LINE = 28;
const TITLE_GAP = 6;
/** `text-[0.875rem] leading-5`, capped by `max-h-[420px]`. */
const BODY_LINE = 20;
const BODY_MAX = 420;
/** A checklist row: `leading-5` + `py-px`. */
const ITEM_ROW = 22;
/** Card preview truncation (NoteBody). */
const MAX_UNCHECKED = 8;
const MAX_CHECKED = 6;
/** The "N marcados" header plus its divider (`mt-1.5 border-t pt-1.5`). */
const CHECKED_HEADER = 32;
/** A chip strip: label chips, the reminder chip, collaborators. */
const CHIP_ROW = 32;
/** `h-[38px]` toolbar + `pb-0.5`. */
const TOOLBAR = 40;
/** `px-4 pt-3 pb-2` around the title/body block. */
const CONTENT_PAD_Y = 20;
const CONTENT_PAD_X = 32;
/** `min-h-[56px]` on the clickable region. */
const MIN_CONTENT = 56;
/** The 1px border top and bottom. */
const BORDER = 2;
/** The empty-note placeholder (`py-3` + one line). */
const EMPTY_BODY = 44;
/** Title reserves `pr-7` for the pin button. */
const TITLE_PIN_GUTTER = 28;
/** Average glyph advance, roughly: semibold 19px title / regular 14px body. */
const TITLE_CHAR_W = 9.6;
const BODY_CHAR_W = 6.7;
/** Checklist rows lose the checkbox column (`h-5 w-5` + `gap-1.5`). */
const ITEM_TEXT_INSET = 26;
/** Images fall back to Keep's 4:3 card thumb when the size is unknown. */
const DEFAULT_IMAGE_RATIO = 3 / 4;

function lines(text: string, charWidth: number, availW: number): number {
  if (text === '') return 0;
  const perLine = Math.max(1, Math.floor(availW / charWidth));
  return Math.max(1, Math.ceil(text.length / perLine));
}

const BLOCK_END = /<br\s*\/?>|<hr\s*\/?>|<\/(?:p|div|li|h[1-6]|blockquote|pre)\s*>/gi;
/** Stands in for a line break while tags are stripped; never in note text. */
const MARK = String.fromCharCode(0);

/**
 * Every block ends a line, and an EMPTY one still costs a full line — pasted
 * Keep notes are full of blank paragraphs and `.note-body p` gives each one a
 * `min-height` of a full line.
 */
function bodyHeight(bodyHtml: string, availW: number): number {
  if (bodyHtml === '') return 0;
  const blocks = bodyHtml
    .replace(BLOCK_END, MARK)
    .replace(/<[^>]+>/g, '')
    .split(MARK);
  // Text after the final block end is markup slack, not one more line.
  if (blocks.length > 1 && blocks.at(-1)?.trim() === '') blocks.pop();
  const total = blocks.reduce(
    (sum, block) => sum + Math.max(1, lines(block.trim(), BODY_CHAR_W, availW)),
    0,
  );
  return Math.min(BODY_MAX, Math.max(1, total) * BODY_LINE);
}

function checklistHeight(note: FullNote, availW: number): number {
  const unchecked = note.items.filter((i) => !i.checked);
  const checked = note.items.filter((i) => i.checked);
  const rowsOf = (items: typeof note.items, max: number) =>
    items
      .slice(0, max)
      .reduce(
        (sum, i) =>
          sum + lines(i.text, BODY_CHAR_W, availW - ITEM_TEXT_INSET - i.indent * 20) * ITEM_ROW,
        0,
      );

  let h = rowsOf(unchecked, MAX_UNCHECKED);
  if (unchecked.length > MAX_UNCHECKED) h += 16; // the "…" row
  if (checked.length > 0) h += CHECKED_HEADER + rowsOf(checked, MAX_CHECKED);
  return h;
}

function imagesHeight(note: FullNote, cardW: number): number {
  let h = 0;
  for (const att of note.attachments) {
    if (att.kind === 'image') {
      const ratio = att.width && att.height ? att.height / att.width : DEFAULT_IMAGE_RATIO;
      h += Math.round(cardW * ratio);
    } else if (att.kind === 'audio') {
      h += 54; // the <audio> player
    }
  }
  return h;
}

/** Predicted rendered height of `note`'s card at `cardW` pixels wide. */
export function estimateNoteHeight(note: FullNote, cardW: number): number {
  const bodyW = Math.max(80, cardW - CONTENT_PAD_X);
  const isEmpty =
    !note.title && !note.bodyHtml && note.items.length === 0 && note.attachments.length === 0;

  let content = CONTENT_PAD_Y;
  if (note.title) {
    content += lines(note.title, TITLE_CHAR_W, bodyW - TITLE_PIN_GUTTER) * TITLE_LINE + TITLE_GAP;
  }
  if (isEmpty) content += EMPTY_BODY;
  else if (note.type === 'list') content += checklistHeight(note, bodyW);
  else content += bodyHeight(note.bodyHtml, bodyW);

  let h = imagesHeight(note, cardW) + Math.max(MIN_CONTENT, content) + TOOLBAR + BORDER;
  if (note.reminder) h += CHIP_ROW;
  if (note.labelIds.length > 0) h += CHIP_ROW;
  if (note.collaborators.length > 1) h += 30;
  return Math.round(h);
}
