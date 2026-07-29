import checkedSvg from '@material-symbols/svg-500/outlined/check_box.svg?raw';
import uncheckedSvg from '@material-symbols/svg-500/outlined/check_box_outline_blank.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon.js';

/**
 * Card content preview. bodyHtml is server-sanitized (or locally constructed
 * from escaped text) — rendering it raw is safe by contract.
 */
export function NoteBody({ note }: { note: FullNote }) {
  const { t } = useTranslation('notes');

  if (note.type === 'list') {
    const unchecked = note.items.filter((i) => !i.checked);
    const checkedCount = note.items.length - unchecked.length;
    const shown = unchecked.slice(0, 8);
    return (
      <div className="flex flex-col gap-1 text-[0.875rem] text-on-surface leading-5">
        {shown.map((item) => (
          <div key={item.id} className={`flex gap-2 ${item.indent === 1 ? 'pl-5' : ''}`}>
            <Icon svg={uncheckedSvg} size={16} className="mt-0.5 text-on-surface-variant" />
            <span className="min-w-0 break-words">{item.text}</span>
          </div>
        ))}
        {unchecked.length > shown.length && (
          <span className="text-on-surface-variant text-xs">…</span>
        )}
        {checkedCount > 0 && (
          <div className="mt-1 flex items-center gap-2 text-on-surface-variant text-xs">
            <Icon svg={checkedSvg} size={14} />
            {t('completedItemsSummary', { count: checkedCount })}
          </div>
        )}
      </div>
    );
  }

  if (!note.bodyHtml) return null;
  return (
    <div
      className="note-body max-h-[420px] overflow-hidden break-words text-[0.875rem] text-on-surface leading-5"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized allowlist html (see lib/sanitize on the server)
      dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
    />
  );
}
