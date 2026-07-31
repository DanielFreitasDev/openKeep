import linkSvg from '@material-symbols/svg-700/outlined/link.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { selectBacklinks } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { Icon } from '../Icon.js';
import { noteLinkLabel } from './NotePicker.js';

/**
 * "Mentioned in": the notes whose body links to this one.
 *
 * The other half of `[[`, and the half that makes a pile of notes a graph —
 * the link you wrote in one note is readable from the other end without
 * anybody having to remember to write it twice.
 *
 * Read off the corpus the client already holds rather than a route of its own:
 * a body is html and the href is an exact shape, so the answer is a scan the
 * search already does per keystroke. If an account ever grows past what that
 * scan can carry, the query moves to the server without the panel changing.
 */
export function NoteBacklinks({
  note,
  onOpen,
}: {
  note: FullNote;
  onOpen: (noteId: string) => void;
}) {
  const { t } = useTranslation('editor');
  const { data: notes } = useQuery(notesQuery);
  const sources = selectBacklinks(notes ?? [], note.id);
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pb-2">
      <div className="flex items-center gap-1 px-1 text-on-surface-variant text-xs">
        <Icon svg={linkSvg} size={14} className="flex-none" />
        {t('mentionedIn', { count: sources.length })}
      </div>
      <div className="flex flex-wrap gap-1">
        {sources.map((source) => (
          <button
            key={source.id}
            type="button"
            className="max-w-full truncate rounded-full bg-(--surface-hover) px-2.5 py-1 text-on-surface text-xs hover:bg-(--outline-variant)"
            onClick={() => onOpen(source.id)}
          >
            {noteLinkLabel(source, t('untitled'))}
          </button>
        ))}
      </div>
    </div>
  );
}
