import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import type { Editor } from '@tiptap/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { selectLinkTargets } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { insertNoteLink } from '../../lib/tiptap.js';

/**
 * Committing a pick, in the click that made it.
 *
 * This used to be deferred a turn of the event loop, so that its `.focus()`
 * would land after the dismissing popover had taken focus away. It could not
 * win that race: the chain's `.focus()` is itself a frame late (TipTap defers
 * `view.focus()` to a rAF), so both orderings left a window with the popup
 * gone, the caret on `<body>` and everything typed in it discarded — a frame
 * idle, hundreds of milliseconds on a loaded machine. `insertNoteLink` now
 * takes focus synchronously instead, which turns the popup's `focusout` into
 * a handover to the editor and leaves no window to type into.
 */
export function pickNoteLink(editor: Editor | null, target: FullNote, untitled: string): void {
  if (!editor || editor.isDestroyed) return;
  insertNoteLink(editor, target.id, noteLinkLabel(target, untitled));
}

/** The line a note is offered by: its title, or the first thing it says. */
export function noteLinkLabel(note: FullNote, untitled: string): string {
  if (note.title.trim() !== '') return note.title;
  const body =
    note.type === 'list'
      ? note.items.map((i) => i.text).join(', ')
      : note.bodyHtml.replace(/<[^>]+>/g, ' ');
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 60);
  return snippet === '' ? untitled : snippet;
}

/**
 * The `[[` picker: which note to link to.
 *
 * Deliberately the shape of the `#` label picker — filter input on top, rows
 * under it — because it answers the same question in the same place, and the
 * two gestures are neighbours on the keyboard of anyone who uses either. What
 * it does not do is create: a link to a note that does not exist yet is a
 * different feature, and Enter here means "the first match", the way search does.
 */
export function NotePicker({
  excludeId,
  onPick,
}: {
  /** The note being written in — never a candidate for its own link. */
  excludeId: string | null;
  onPick: (note: FullNote) => void;
}) {
  const { t } = useTranslation('editor');
  const { data: notes } = useQuery(notesQuery);
  const [filter, setFilter] = useState('');

  const targets = selectLinkTargets(notes ?? [], excludeId, filter.trim());

  return (
    <div className="flex w-64 flex-col py-2">
      <div className="px-3 pb-1 font-medium text-on-surface text-sm">{t('linkNote')}</div>
      <input
        type="text"
        value={filter}
        placeholder={t('linkNoteFilter')}
        aria-label={t('linkNoteFilter')}
        maxLength={100}
        // biome-ignore lint/a11y/noAutofocus: the gesture that opens it was a keystroke — the caret has to land here
        autoFocus
        className="mx-3 mb-1 border-(--outline-variant) border-b bg-transparent py-1 text-on-surface text-sm outline-none focus:border-(--primary)"
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          const first = targets[0];
          if (e.key === 'Enter' && first) {
            e.preventDefault();
            onPick(first);
          }
        }}
      />
      <div className="max-h-64 overflow-y-auto">
        {targets.length === 0 ? (
          <div className="px-3 py-1.5 text-on-surface-variant text-sm">{t('linkNoteEmpty')}</div>
        ) : (
          targets.map((note) => (
            <button
              key={note.id}
              type="button"
              className="block w-full truncate px-3 py-1.5 text-left text-on-surface text-sm hover:bg-(--surface-hover)"
              onClick={() => onPick(note)}
            >
              {noteLinkLabel(note, t('untitled'))}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
