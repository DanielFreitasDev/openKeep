import checkedSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import uncheckedSvg from '@material-symbols/svg-700/outlined/check_box_outline_blank.svg?raw';
import linkOffSvg from '@material-symbols/svg-700/outlined/link_off.svg?raw';
import type { NoteItem, PublicNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EmptyView } from '../components/EmptyView.js';
import { Icon } from '../components/Icon.js';
import { FileChip } from '../components/notes/NoteFileChips.js';
import { formatEdited } from '../lib/dates.js';
import { publicAttachmentUrl, publicNoteQuery } from '../lib/share-link-api.js';

export const Route = createFileRoute('/s/$token')({ component: PublicNotePage });

/**
 * A note opened from its public link. Outside `_shell` on purpose: there is no
 * session, no sidebar and nothing to navigate to — the page is the note, and
 * the only account it knows about is the one the reader might not have.
 */
function PublicNotePage() {
  const { token } = Route.useParams();
  const { t, i18n } = useTranslation('sharing');
  const { data: note, isPending, isError } = useQuery(publicNoteQuery(token));

  return (
    <div className="min-h-dvh bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="font-medium text-lg text-on-surface">
          {t('common:appName')}
        </Link>
        {note && (
          <span className="rounded-full bg-(--surface-hover) px-3 py-1 text-on-surface-variant text-xs">
            {t('viewOnly')}
          </span>
        )}
      </header>

      <main className="mx-auto w-full max-w-[42rem] px-4 pb-16">
        {isPending && (
          <p className="py-16 text-center text-on-surface-variant">{t('common:loading')}</p>
        )}
        {isError && (
          <>
            <EmptyView svg={linkOffSvg} text={t('linkUnavailable')} />
            <p className="text-center text-on-surface-variant text-sm">
              {t('linkUnavailableHint')}
            </p>
          </>
        )}
        {note && <PublicNoteCard note={note} token={token} lang={i18n.language} />}
      </main>
    </div>
  );
}

function PublicNoteCard({ note, token, lang }: { note: PublicNote; token: string; lang: string }) {
  const { t } = useTranslation('sharing');
  const images = note.attachments.filter((a) => a.kind === 'image' || a.kind === 'drawing');
  const audios = note.attachments.filter((a) => a.kind === 'audio');
  const files = note.attachments.filter((a) => a.kind === 'file');

  return (
    <article
      className="overflow-hidden rounded-lg border border-(--outline-variant) text-on-surface shadow-(--elevation-1)"
      style={{ background: `var(--note-${note.color})` }}
    >
      {images.map((att) => (
        <img
          key={att.id}
          // The original, not the thumb: this page is the note at full size.
          src={publicAttachmentUrl(token, att.id, 'file', att.updatedAt)}
          alt=""
          width={att.width ?? undefined}
          height={att.height ?? undefined}
          className="block h-auto w-full"
          style={
            att.width && att.height ? { aspectRatio: `${att.width} / ${att.height}` } : undefined
          }
        />
      ))}

      <div className="px-5 py-4">
        {note.title && <h1 className="pb-2 font-medium text-xl">{note.title}</h1>}

        {note.type === 'list' ? (
          <PublicChecklist items={note.items} />
        ) : (
          note.bodyHtml && (
            <div
              className="note-body break-words text-[0.9375rem] leading-6"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized allowlist html (see lib/sanitize on the server)
              dangerouslySetInnerHTML={{ __html: note.bodyHtml }}
            />
          )
        )}

        {audios.map((att) => (
          // biome-ignore lint/a11y/useMediaCaption: user-recorded audio notes have no caption track
          <audio
            key={att.id}
            controls
            preload="none"
            src={publicAttachmentUrl(token, att.id, 'file')}
            className="my-2 w-full"
          />
        ))}

        {files.length > 0 && (
          <div className="flex flex-col gap-1 pt-2">
            {files.map((att) => (
              <FileChip
                key={att.id}
                href={publicAttachmentUrl(token, att.id, 'file')}
                attachment={att}
              />
            ))}
          </div>
        )}

        <p className="pt-4 text-on-surface-variant text-xs">
          {t('editor:edited', { time: formatEdited(note.updatedAt, lang) })}
        </p>
      </div>
    </article>
  );
}

/**
 * Read-only checklist: no boxes to click, and checked items sink to the bottom
 * the way the default setting shows them to the person who shared it.
 */
function PublicChecklist({ items }: { items: NoteItem[] }) {
  const ordered = [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)];
  return (
    <ul className="flex flex-col text-[0.9375rem] leading-6">
      {ordered.map((item) => (
        <li key={item.id} className={`flex gap-2 py-px ${item.indent === 1 ? 'pl-6' : ''}`}>
          <Icon
            svg={item.checked ? checkedSvg : uncheckedSvg}
            size={18}
            className="mt-0.5 flex-none text-on-surface-variant"
          />
          <span
            className={`min-w-0 break-words ${item.checked ? 'text-on-surface-variant line-through' : ''}`}
          >
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
