import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { displayGroups } from '../components/notes/checklist-logic.js';
import { attachmentFileUrl } from '../lib/attachments-api.js';
import { formatEdited } from '../lib/dates.js';
import { labelsQuery } from '../lib/labels-api.js';
import { printNote } from '../lib/print-note.js';
import { settingsQuery } from '../lib/queries.js';

/**
 * Turns a note into the printable sheet (lib/print-note) and opens the print
 * dialog. The card menu and the editor menu both call this, so the paper looks
 * the same wherever printing starts — checklist rows in the order the app
 * displays them, labels and the edited stamp in the footer.
 */
export function usePrintNote(): (note: FullNote) => void {
  const { t, i18n } = useTranslation('editor');
  const { data: labels } = useQuery(labelsQuery);
  const { data: settings } = useQuery(settingsQuery);

  return (note) => {
    const groups = displayGroups(
      note.items.map((item) => ({ ...item, key: item.id })),
      settings?.moveCheckedToBottom ?? true,
    );
    const rows = note.type === 'list' ? [...groups.unchecked, ...groups.checked] : [];
    const labelNames = (labels ?? [])
      .filter((label) => note.labelIds.includes(label.id))
      .map((label) => label.name);

    void printNote({
      title: note.title,
      bodyHtml: note.type === 'list' ? '' : note.bodyHtml,
      items: rows.map(({ text, checked, indent }) => ({ text, checked, indent })),
      imageUrls: note.attachments
        .filter((att) => att.kind === 'image' || att.kind === 'drawing')
        // Originals, not thumbs: the thumbnail is sized for a 240px card.
        .map((att) => attachmentFileUrl(att.id, att.updatedAt)),
      meta: [...labelNames, t('edited', { time: formatEdited(note.updatedAt, i18n.language) })],
      documentTitle: note.title || t('notePlaceholder'),
    });
  };
}
