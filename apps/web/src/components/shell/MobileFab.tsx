import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import brushSvg from '@material-symbols/svg-700/outlined/brush.svg?raw';
import checkboxSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import textSvg from '@material-symbols/svg-700/outlined/text_fields.svg?raw';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { Icon } from '../Icon.js';

/**
 * Keep-app create FAB (mobile only): the "+" expands into Image / List / Text,
 * creates the note optimistically and opens the full-screen editor with
 * `new=true` so an untouched note is discarded on close. On a label view the
 * new note starts with that label (Keep-app behavior).
 */
export function MobileFab({ labelId }: { labelId?: string }) {
  const { t } = useTranslation('shell');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const m = useNoteMutations();
  const labelM = useLabelMutations();
  const attachmentM = useAttachmentMutations();
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const createAndOpen = (type: 'text' | 'list', file?: File) => {
    setOpen(false);
    const id = m.newNoteId();
    m.create.mutate({
      id,
      type,
      title: '',
      bodyHtml: '',
      items: [],
      pinned: false,
      color: 'default',
      background: 'none',
    });
    if (labelId) labelM.setNoteLabel.mutate({ noteId: id, labelId, on: true });
    if (file) attachmentM.upload.mutate({ noteId: id, file });
    void navigate({
      to: '.',
      // A note born from a picked image is intentional — never discard it, or
      // the empty-note check could race the still-uploading attachment.
      search: (old: Record<string, unknown>) => ({
        ...old,
        note: id,
        new: file ? undefined : true,
      }),
      resetScroll: false,
    });
  };

  return (
    <div className="md:hidden">
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss is a pointer affordance; Esc closes too
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users close the menu with Esc, not the scrim
        <div
          className="fixed inset-0 z-30 bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-3">
        {open && (
          <>
            <FabAction
              svg={imageSvg}
              label={t('createImage')}
              onClick={() => imageInputRef.current?.click()}
            />
            <FabAction
              svg={brushSvg}
              label={t('createDrawing')}
              onClick={() => {
                setOpen(false);
                // The note is only created when ink is saved (Keep behavior).
                void navigate({
                  to: '.',
                  search: (old: Record<string, unknown>) => ({ ...old, drawing: 'new' }),
                  resetScroll: false,
                });
              }}
            />
            <FabAction
              svg={checkboxSvg}
              label={t('createList')}
              onClick={() => createAndOpen('list')}
            />
            <FabAction
              svg={textSvg}
              label={t('createText')}
              onClick={() => createAndOpen('text')}
            />
          </>
        )}
        <button
          type="button"
          aria-label={open ? t('common:close') : t('newNote')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-16 w-16 items-center justify-center shadow-(--elevation-3) outline-none transition-[border-radius,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-(--primary) ${
            open
              ? 'rounded-full bg-primary text-on-primary'
              : 'rounded-2xl bg-(--fab-container) text-(--on-fab-container)'
          }`}
        >
          <Icon svg={open ? closeSvg : addSvg} size={28} />
        </button>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) createAndOpen('text', file);
        }}
      />
    </div>
  );
}

function FabAction({ svg, label, onClick }: { svg: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 items-center gap-3 rounded-full bg-(--fab-container) pr-5 pl-4 font-medium text-[0.95rem] text-(--on-fab-container) shadow-(--elevation-2)"
    >
      <Icon svg={svg} size={20} />
      {label}
    </button>
  );
}
