import checkedSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import uncheckedSvg from '@material-symbols/svg-700/outlined/check_box_outline_blank.svg?raw';
import chevronSvg from '@material-symbols/svg-700/outlined/keyboard_arrow_down.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { canEditContent } from '../../lib/note-permissions.js';
import { settingsQuery } from '../../lib/queries.js';
import { Icon } from '../Icon.js';
import type { ChecklistRow } from './checklist-logic.js';
import { displayGroups } from './checklist-logic.js';
import { HighlightedText, useHighlightedHtml } from './SearchHighlight.js';

/** A long list is truncated on the card; the note itself shows the rest. */
const MAX_UNCHECKED = 8;
const MAX_CHECKED = 6;

/** Ticking a preview box; the card owns the mutation so lists don't spawn one each. */
type ToggleItem = (itemId: string, checked: boolean) => void;

/**
 * Card content preview. bodyHtml is server-sanitized (or locally constructed
 * from escaped text) — rendering it raw is safe by contract.
 */
export function NoteBody({ note, onToggleItem }: { note: FullNote; onToggleItem: ToggleItem }) {
  if (note.type === 'list') return <ChecklistPreview note={note} onToggleItem={onToggleItem} />;

  if (!note.bodyHtml) return null;
  return <HtmlPreview html={note.bodyHtml} />;
}

/**
 * On the search screen the matched words come back marked; everywhere else
 * `useHighlightedHtml` hands the html straight back. Either way it is still
 * the server's allowlist, `<mark>` included.
 */
function HtmlPreview({ html }: { html: string }) {
  const marked = useHighlightedHtml(html);
  return (
    <div
      className="note-body max-h-[420px] overflow-hidden break-words text-[0.875rem] text-on-surface leading-5"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized allowlist html (see lib/sanitize on the server)
      dangerouslySetInnerHTML={{ __html: marked }}
    />
  );
}

/**
 * The closed-card checklist: same grouping the editor uses, and the boxes are
 * live — Keep lets you tick items without opening the note.
 */
function ChecklistPreview({ note, onToggleItem }: { note: FullNote; onToggleItem: ToggleItem }) {
  const { t } = useTranslation('editor');
  const { data: settings } = useQuery(settingsQuery);
  const readOnly = !canEditContent(note);

  const rows: ChecklistRow[] = note.items.map((i) => ({ ...i, key: i.id }));
  const groups = displayGroups(rows, settings?.moveCheckedToBottom ?? true);
  const shownUnchecked = groups.unchecked.slice(0, MAX_UNCHECKED);
  const shownChecked = groups.checked.slice(0, MAX_CHECKED);

  const toggle = (row: ChecklistRow, checked: boolean) => onToggleItem(row.key, checked);

  return (
    <div className="flex flex-col text-[0.875rem] text-on-surface leading-5">
      {shownUnchecked.map((row) => (
        <PreviewRow key={row.key} row={row} readOnly={readOnly} onCheck={toggle} />
      ))}
      {groups.unchecked.length > shownUnchecked.length && (
        <span className="pl-7 text-on-surface-variant text-xs">…</span>
      )}

      {groups.checked.length > 0 && (
        <div className="mt-1.5 border-(--outline-variant) border-t pt-1.5">
          <div className="flex items-center gap-1 text-on-surface-variant text-[0.8125rem]">
            <Icon svg={chevronSvg} size={16} className="flex-none" />
            {t('completedItems', { count: groups.checked.length })}
          </div>
          {shownChecked.map((row) => (
            <PreviewRow key={row.key} row={row} readOnly={readOnly} onCheck={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

interface PreviewRowProps {
  row: ChecklistRow;
  readOnly: boolean;
  onCheck: (row: ChecklistRow, checked: boolean) => void;
}

function PreviewRow({ row, readOnly, onCheck }: PreviewRowProps) {
  const { t } = useTranslation('editor');
  const svg = row.checked ? checkedSvg : uncheckedSvg;
  const boxClass = 'flex h-5 w-5 flex-none items-center justify-center text-on-surface-variant';

  return (
    <div className={`flex gap-1.5 py-px ${row.indent === 1 ? 'pl-5' : ''}`}>
      {readOnly ? (
        <span className={boxClass}>
          <Icon svg={svg} size={16} />
        </span>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: a native checkbox cannot carry the Material box glyph
        <button
          type="button"
          role="checkbox"
          aria-checked={row.checked}
          aria-label={row.text || t('listItemPlaceholder')}
          className={`${boxClass} rounded hover:text-on-surface`}
          onClick={(e) => {
            // The whole card is a button; ticking a box must not open the note.
            e.stopPropagation();
            onCheck(row, !row.checked);
          }}
        >
          <Icon svg={svg} size={16} />
        </button>
      )}
      <span
        className={`min-w-0 break-words ${row.checked ? 'text-on-surface-variant line-through' : ''}`}
      >
        <HighlightedText text={row.text} />
      </span>
    </div>
  );
}
