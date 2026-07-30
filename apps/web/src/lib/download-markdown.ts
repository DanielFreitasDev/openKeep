import { type FullNote, markdownFileName, noteToMarkdown } from '@openkeep/shared';

/**
 * "Download as .md" for one note.
 *
 * Built in the browser from the note already in memory rather than through the
 * API: the same serializer runs on both sides, so a round trip would buy
 * nothing — and this way the button works offline, like the rest of the app.
 *
 * No front matter here, unlike the backup zip: a single file people asked for
 * by name should open in any editor as the note they see, not as a record.
 */
export function downloadNoteMarkdown(note: FullNote): void {
  const markdown = noteToMarkdown({
    title: note.title,
    type: note.type,
    bodyHtml: note.bodyHtml,
    items: note.items.map((item) => ({
      text: item.text,
      checked: item.checked,
      indent: item.indent,
    })),
  });

  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = markdownFileName(note.title, note.id);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
