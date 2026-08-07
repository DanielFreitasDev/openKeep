import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import drawSvg from '@material-symbols/svg-700/outlined/draw.svg?raw';
import type { Attachment, FullNote } from '@openkeep/shared';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { attachmentFileUrl, attachmentThumbUrl } from '../../lib/attachments-api.js';
import { selectImageStack } from '../../lib/note-selectors.js';
import { IconButton } from '../IconButton.js';

/**
 * Keep's collage rows: three across, then two when only four are left, and
 * never a lone image stranded on a row of its own.
 */
function collageRows(images: Attachment[]): Attachment[][] {
  const rows: Attachment[][] = [];
  for (let i = 0; i < images.length; ) {
    const take = images.length - i === 4 ? 2 : Math.min(3, images.length - i);
    rows.push(images.slice(i, i + take));
    i += take;
  }
  return rows;
}

/**
 * Attachment stack above the title (Keep) — images and drawings. Cards use
 * thumbs; the editor uses originals, offers per-image delete, and tapping a
 * drawing reopens the drawing editor. Audio renders a player.
 *
 * One image shows whole, at its own proportions; several tile into a collage
 * of equal-height rows, because stacking them full-width turns a note with
 * three photos into a scroll of its own.
 */
export function NoteImages({ note, editable = false }: { note: FullNote; editable?: boolean }) {
  const { t } = useTranslation('notes');
  const navigate = useNavigate();
  const m = useAttachmentMutations();
  const images = selectImageStack(note.attachments);
  const audios = note.attachments.filter((a) => a.kind === 'audio');
  if (images.length === 0 && audios.length === 0) return null;

  const editDrawing = (att: Attachment) =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, drawing: att.id, photo: undefined }),
      resetScroll: false,
    });

  /** Open a fresh drawing over this photo; the photo itself stays attached. */
  const drawOnImage = (att: Attachment) =>
    void navigate({
      to: '.',
      search: (old: Record<string, unknown>) => ({ ...old, drawing: 'new', photo: att.id }),
      resetScroll: false,
    });

  const tiled = images.length > 1;

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
      className={tiled ? 'block h-full w-full object-cover' : 'block h-auto w-full'}
      style={
        !tiled && att.width && att.height
          ? { aspectRatio: `${att.width} / ${att.height}` }
          : undefined
      }
    />
  );

  const tile = (att: Attachment) => (
    <div key={att.id} className={`group/img relative ${tiled ? 'min-w-0 flex-1' : ''}`}>
      {editable && att.kind === 'drawing' ? (
        <button
          type="button"
          aria-label={t('drawing:editDrawing')}
          className={`block w-full outline-none focus-visible:ring-2 focus-visible:ring-(--primary) ${
            tiled ? 'h-full' : ''
          }`}
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
        <div className="absolute right-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-hover/img:opacity-100">
          {att.kind === 'image' && (
            <IconButton
              svg={drawSvg}
              label={t('drawing:drawOnImage')}
              size={32}
              iconSize={16}
              className="bg-(--scrim) text-white hover:bg-black/70"
              onClick={(e) => {
                e.stopPropagation();
                drawOnImage(att);
              }}
            />
          )}
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
  );

  return (
    // `flex-none`: inside the editor's scroller this is a flex item, and a
    // shrinking one would squeeze the picture into a hidden scroll box of its
    // own instead of letting the note scroll past it.
    <div className="flex-none overflow-hidden rounded-t-lg">
      {tiled
        ? collageRows(images).map((row) => (
            // Every row is the same height whatever it holds, so the collage
            // reads as a block rather than a ladder.
            <div key={row[0]?.id} className="flex aspect-[12/5] gap-px mt-px first:mt-0">
              {row.map(tile)}
            </div>
          ))
        : images.map(tile)}
      {audios.map((att) => (
        <div key={att.id} className="flex items-center gap-1 px-2">
          {/* biome-ignore lint/a11y/useMediaCaption: user-recorded audio notes have no caption track */}
          <audio
            controls
            preload="none"
            src={attachmentFileUrl(att.id)}
            className="my-1 min-w-0 flex-1"
            onClick={(e) => e.stopPropagation()}
          />
          {editable && (
            // Always visible, unlike the one over an image: a native player
            // fills its row, so there is no quiet corner to reveal it in.
            <IconButton
              svg={closeSvg}
              label={t('removeAudio')}
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
