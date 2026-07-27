import { Popover } from '@base-ui/react/popover';
import checkboxSvg from '@material-symbols/svg-400/outlined/check_box.svg?raw';
import imageSvg from '@material-symbols/svg-400/outlined/image.svg?raw';
import pinSvg from '@material-symbols/svg-400/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-400/outlined/keep-fill.svg?raw';
import paletteSvg from '@material-symbols/svg-400/outlined/palette.svg?raw';
import type { NoteBackground, NoteColor } from '@openkeep/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { plainTextToHtml } from '../../lib/html.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { ColorPicker } from './ColorPicker.js';

/**
 * The Keep composer: collapsed "Take a note…" row that expands in place;
 * click-away saves; empty notes are discarded with a snackbar.
 */
export function Composer() {
  const { t } = useTranslation('notes');
  const m = useNoteMutations();
  const show = useSnackbarStore((s) => s.show);

  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [color, setColor] = useState<NoteColor>('default');
  const [background, setBackground] = useState<NoteBackground>('none');

  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const collapsedRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setExpanded(false);
    setTitle('');
    setBody('');
    setPinned(false);
    setColor('default');
    setBackground('none');
  };

  const save = () => {
    const hasContent = title.trim() !== '' || body.trim() !== '';
    if (hasContent) {
      m.create.mutate({
        id: m.newNoteId(),
        type: 'text',
        title: title.trim(),
        bodyHtml: body.trim() === '' ? '' : plainTextToHtml(body),
        items: [],
        pinned,
        color,
        background,
      });
    } else if (expanded) {
      show({ message: t('emptyNoteDiscarded') });
    }
    reset();
  };

  // Click-away saves (Keep behavior). Popover portals live outside the root,
  // so ignore clicks inside any [data-composer-popover].
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (rootRef.current?.contains(target)) return;
      if (target.closest('[data-composer-popover]')) return;
      save();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  });

  // Keep focuses the composer on load.
  useEffect(() => {
    collapsedRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (expanded) bodyRef.current?.focus();
  }, [expanded]);

  const isDefaultColor = color === 'default';

  return (
    <div className="mx-auto mt-8 mb-6 w-full max-w-[600px] px-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: shortcuts bubble up from the inner inputs */}
      <div
        ref={rootRef}
        className="rounded-lg border shadow-(--elevation-2)"
        style={{
          background: `var(--note-${color})`,
          borderColor: isDefaultColor ? 'var(--outline)' : 'transparent',
        }}
        onKeyDown={(e) => {
          if (expanded && (e.key === 'Escape' || (e.key === 'Enter' && e.ctrlKey))) {
            e.preventDefault();
            save();
          }
        }}
      >
        {!expanded ? (
          <div className="flex items-center py-1 pr-2 pl-4">
            <input
              ref={collapsedRef}
              type="text"
              placeholder={t('takeANote')}
              aria-label={t('takeANote')}
              className="h-10 w-full bg-transparent font-medium text-[0.95rem] text-on-surface outline-none placeholder:text-on-surface-variant"
              onClick={() => setExpanded(true)}
              onKeyDown={(e) => {
                // Focused on load (Keep) but expands only on click/typing.
                if (e.key.length === 1 || e.key === 'Enter') {
                  e.preventDefault();
                  if (e.key.length === 1) setBody(e.key);
                  setExpanded(true);
                }
              }}
              readOnly
            />
            <IconButton
              svg={checkboxSvg}
              label={t('newList')}
              className="text-on-surface-variant"
              disabled
            />
            <IconButton
              svg={imageSvg}
              label={t('newNoteWithImage')}
              className="text-on-surface-variant"
              disabled
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-start">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('title')}
                aria-label={t('title')}
                maxLength={999}
                className="w-full bg-transparent px-4 pt-3 pb-2 font-medium text-[1rem] text-on-surface outline-none placeholder:text-on-surface-variant"
              />
              <div className="pt-1.5 pr-1.5">
                <IconButton
                  svg={pinned ? pinFilledSvg : pinSvg}
                  label={pinned ? t('unpinNote') : t('pinNote')}
                  size={38}
                  iconSize={20}
                  className="text-on-surface-variant"
                  onClick={() => setPinned((p) => !p)}
                />
              </div>
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }}
              placeholder={t('takeANote')}
              aria-label={t('takeANote')}
              rows={1}
              className="max-h-[60vh] w-full resize-none overflow-y-auto bg-transparent px-4 pb-3 text-[0.875rem] text-on-surface leading-5 outline-none placeholder:text-on-surface-variant"
            />
            <div className="flex items-center gap-1 px-2 pb-1.5">
              <Popover.Root>
                <Popover.Trigger
                  aria-label={t('backgroundOptions')}
                  title={t('backgroundOptions')}
                  className={iconButtonClass}
                  style={{ width: 36, height: 36 }}
                >
                  <Icon svg={paletteSvg} size={18} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner className="z-50" sideOffset={4}>
                    <Popover.Popup
                      data-composer-popover
                      className="z-40 rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)"
                    >
                      <ColorPicker
                        color={color}
                        background={background}
                        onColor={setColor}
                        onBackground={setBackground}
                      />
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
              <button
                type="button"
                onClick={save}
                className="ml-auto rounded px-6 py-2 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
              >
                {t('common:close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
