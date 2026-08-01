import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import descriptionSvg from '@material-symbols/svg-700/outlined/description.svg?raw';
import type { Attachment, FullNote } from '@openkeep/shared';
import { fileExtensionOf } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { attachmentFileUrl } from '../../lib/attachments-api.js';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';

/**
 * File attachments (`kind='file'`) as download chips at the bottom of the card
 * and the editor — next to the link previews rather than in the image stack
 * above the title: a document is something the note points at, not something it
 * shows. The server serves them as downloads, so a plain anchor is the whole
 * interaction.
 */
export function NoteFileChips({ note, editable = false }: { note: FullNote; editable?: boolean }) {
  const { t } = useTranslation('notes');
  const m = useAttachmentMutations();
  const files = note.attachments.filter((a) => a.kind === 'file');
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pb-2">
      {files.map((att) => (
        <div key={att.id} className="flex items-center gap-1">
          <FileChip href={attachmentFileUrl(att.id)} attachment={att} />
          {editable && (
            <IconButton
              svg={closeSvg}
              label={t('removeFile')}
              size={32}
              iconSize={16}
              className="flex-none text-on-surface-variant"
              onClick={(e) => {
                e.stopPropagation();
                m.remove.mutate({ noteId: note.id, attachmentId: att.id });
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** The chip itself, shared with the public link page (same anchor, other url). */
export function FileChip({ href, attachment }: { href: string; attachment: Attachment }) {
  const name = attachment.filename ?? '';
  const ext = fileExtensionOf(name).toUpperCase();
  return (
    <a
      href={href}
      download={name}
      onClick={(e) => e.stopPropagation()}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-(--outline-variant) bg-surface/60 px-2 py-1.5 hover:bg-(--surface-hover)"
      data-tooltip={name}
    >
      <Icon svg={descriptionSvg} size={16} className="flex-none text-on-surface-variant" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.75rem] text-on-surface leading-4">{name}</span>
        {ext && (
          <span className="block text-[0.6875rem] text-on-surface-variant leading-3">{ext}</span>
        )}
      </span>
    </a>
  );
}
