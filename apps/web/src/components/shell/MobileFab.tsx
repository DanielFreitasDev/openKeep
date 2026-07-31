import addSvg from '@material-symbols/svg-700/outlined/add.svg?raw';
import brushSvg from '@material-symbols/svg-700/outlined/brush.svg?raw';
import checkboxSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import micSvg from '@material-symbols/svg-700/outlined/mic.svg?raw';
import textSvg from '@material-symbols/svg-700/outlined/text_fields.svg?raw';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { audioRecordingSupported } from '../../hooks/use-audio-recorder.js';
import { useCreateAndOpenNote } from '../../hooks/use-create-note.js';
import { useMountTransition } from '../../hooks/use-mount-transition.js';
import { Icon } from '../Icon.js';

/** Longest collapse: the last action's stagger delay plus its own exit. */
const EXIT_MS = 180;

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
  const createNote = useCreateAndOpenNote();
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
    createNote(type, { labelId, files: file ? [file] : [] });
  };

  // The actions play out of (and back into) the FAB, so they stay mounted for
  // the length of the collapse.
  const { mounted, entered } = useMountTransition(open, EXIT_MS);

  const actions = [
    { svg: imageSvg, label: t('createImage'), onClick: () => imageInputRef.current?.click() },
    // The note is created empty and armed: the editor asks for the microphone
    // on arrival, and a refused take leaves nothing behind (`new`).
    ...(audioRecordingSupported()
      ? [
          {
            svg: micSvg,
            label: t('createRecording'),
            onClick: () => {
              setOpen(false);
              createNote('text', { labelId, record: true });
            },
          },
        ]
      : []),
    {
      svg: brushSvg,
      label: t('createDrawing'),
      onClick: () => {
        setOpen(false);
        // The note is only created when ink is saved (Keep behavior).
        void navigate({
          to: '.',
          search: (old: Record<string, unknown>) => ({ ...old, drawing: 'new' }),
          resetScroll: false,
        });
      },
    },
    { svg: checkboxSvg, label: t('createList'), onClick: () => createAndOpen('list') },
    { svg: textSvg, label: t('createText'), onClick: () => createAndOpen('text') },
  ];

  return (
    <div className="md:hidden">
      {mounted && (
        // biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss is a pointer affordance; Esc closes too
        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users close the menu with Esc, not the scrim
        <div
          className="motion-scrim fixed inset-0 z-30 bg-[color-mix(in_srgb,var(--surface)_72%,transparent)]"
          data-entered={entered || undefined}
          onClick={() => setOpen(false)}
        />
      )}
      <div className="fixed right-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex flex-col items-end gap-3">
        {mounted &&
          actions.map((action, i) => (
            <FabAction
              key={action.label}
              svg={action.svg}
              label={action.label}
              onClick={action.onClick}
              entered={entered}
              // Opening runs bottom-up (the action nearest the FAB leads);
              // collapsing runs top-down, so that same one is last to go.
              delayMs={entered ? (actions.length - 1 - i) * 25 : i * 20}
            />
          ))}
        <button
          type="button"
          aria-label={open ? t('common:close') : t('newNote')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-16 w-16 items-center justify-center shadow-(--elevation-3) outline-none transition-[border-radius,background-color] duration-200 ease-(--ease-standard) focus-visible:outline-2 focus-visible:outline-(--primary) ${
            open
              ? 'rounded-full bg-primary text-on-primary'
              : 'rounded-2xl bg-(--fab-container) text-(--on-fab-container)'
          }`}
        >
          {/* One icon that spins 45° into a close cross, rather than a swap:
              the "+" and the "×" are the same glyph at two angles. */}
          <Icon
            svg={addSvg}
            size={28}
            className={`transition-transform duration-200 ease-(--ease-standard) motion-reduce:transition-none ${
              open ? 'rotate-45' : ''
            }`}
          />
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

function FabAction({
  svg,
  label,
  onClick,
  entered,
  delayMs,
}: {
  svg: string;
  label: string;
  onClick: () => void;
  entered: boolean;
  delayMs: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-entered={entered || undefined}
      style={{ transitionDelay: `${delayMs}ms` }}
      className="fab-action flex h-12 items-center gap-3 rounded-full bg-(--fab-container) pr-5 pl-4 font-medium text-[0.95rem] text-(--on-fab-container) shadow-(--elevation-2)"
    >
      <Icon svg={svg} size={20} />
      {label}
    </button>
  );
}
