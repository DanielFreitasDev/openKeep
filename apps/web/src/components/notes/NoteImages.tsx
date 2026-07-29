import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import type { Attachment, FullNote } from '@openkeep/shared';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { attachmentFileUrl, attachmentThumbUrl } from '../../lib/attachments-api.js';
import { IconButton } from '../IconButton.js';

/**
 * Attachment stack above the title (Keep) — images and drawings. Cards use
 * thumbs; the editor uses originals, offers per-image delete, and tapping a
 * drawing reopens the drawing editor. Audio renders a player.
 */
export function NoteImages({ note, editable = false }: { note: FullNote; editable?: boolean }) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const m = useAttachmentMutations();
  const images = note.attachments.filter((a) => a.kind === 'image' || a.kind === 'drawing');
  const audios = note.attachments.filter((a) => a.kind === 'audio');
  if (images.length === 0 && audios.length === 0) return null;

  const editDrawing = (att: Attachment) =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, drawing: att.id }),
      resetScroll: false,
    });

  const picture = (att: Attachment) => (
    <img
      // updatedAt busts the immutable URL cache when a drawing is re-saved.
      src={
        editable
          ? attachmentFileUrl(att.id, att.updatedAt)
          : attachmentThumbUrl(att.id, att.updatedAt)
      }
      alt=""
      width={att.width ?? undefined}
      height={att.height ?? undefined}
      loading="lazy"
      className="block h-auto w-full"
      style={att.width && att.height ? { aspectRatio: `${att.width} / ${att.height}` } : undefined}
    />
  );

  return (
    <div className="overflow-hidden rounded-t-lg">
      {images.map((att) => (
        <div key={att.id} className="group/img relative">
          {editable && att.kind === 'drawing' ? (
            <button
              type="button"
              aria-label={t('drawing:editDrawing')}
              className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-(--primary)"
              onClick={(e) => {
                e.stopPropagation();
                editDrawing(att);
              }}
            >
              {picture(att)}
            </button>
          ) : (
            picture(att)
          )}
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
