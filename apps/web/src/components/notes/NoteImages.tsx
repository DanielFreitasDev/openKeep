import closeSvg from '@material-symbols/svg-400/outlined/close.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { attachmentFileUrl, attachmentThumbUrl } from '../../lib/attachments-api.js';
import { IconButton } from '../IconButton.js';

/**
 * Attachment stack above the title (Keep). Cards use thumbs; the editor uses
 * originals and offers per-image delete. Audio renders a player.
 */
export function NoteImages({ note, editable = false }: { note: FullNote; editable?: boolean }) {
  const { t } = useTranslation('notes');
  const m = useAttachmentMutations();
  const images = note.attachments.filter((a) => a.kind === 'image');
  const audios = note.attachments.filter((a) => a.kind === 'audio');
  if (images.length === 0 && audios.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-t-lg">
      {images.map((att) => (
        <div key={att.id} className="group/img relative">
          <img
            src={editable ? attachmentFileUrl(att.id) : attachmentThumbUrl(att.id)}
            alt=""
            width={att.width ?? undefined}
            height={att.height ?? undefined}
            loading="lazy"
            className="block h-auto w-full"
            style={
              att.width && att.height ? { aspectRatio: `${att.width} / ${att.height}` } : undefined
            }
          />
          {editable && (
            <div className="absolute right-1 bottom-1 opacity-0 transition-opacity group-hover/img:opacity-100">
              <IconButton
                svg={closeSvg}
                label={t('removeImage')}
                size={32}
                iconSize={16}
                className="bg-(--scrim) text-white hover:bg-black/70"
                onClick={(e) => {
                  e.stopPropagation();
                  m.remove.mutate({ noteId: note.id, attachmentId: att.id });
                }}
              />
            </div>
          )}
        </div>
      ))}
      {audios.map((att) => (
        // biome-ignore lint/a11y/useMediaCaption: user-recorded audio notes have no caption track
        <audio
          key={att.id}
          controls
          preload="none"
          src={attachmentFileUrl(att.id)}
          className="my-1 w-full px-2"
          onClick={(e) => e.stopPropagation()}
        />
      ))}
    </div>
  );
}
