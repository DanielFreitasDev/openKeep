import { Popover } from '@base-ui/react/popover';
import checkboxSvg from '@material-symbols/svg-400/outlined/check_box.svg?raw';
import closeSvg from '@material-symbols/svg-400/outlined/close.svg?raw';
import imageSvg from '@material-symbols/svg-400/outlined/image.svg?raw';
import pinSvg from '@material-symbols/svg-400/outlined/keep.svg?raw';
import pinFilledSvg from '@material-symbols/svg-400/outlined/keep-fill.svg?raw';
import paletteSvg from '@material-symbols/svg-400/outlined/palette.svg?raw';
import type { NoteBackground, NoteColor } from '@openkeep/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAttachmentMutations } from '../../hooks/use-attachment-mutations.js';
import { useKeyScope } from '../../hooks/use-key-scope.js';
import { useNoteMutations } from '../../hooks/use-note-mutations.js';
import { plainTextToHtml } from '../../lib/html.js';
import { useSnackbarStore } from '../../stores/snackbar.js';
import { Icon } from '../Icon.js';
import { IconButton, iconButtonClass } from '../IconButton.js';
import { ColorPicker } from './ColorPicker.js';

const EMPTY_BINDINGS: Record<string, (e: KeyboardEvent) => void> = {};

/**
 * The Keep composer: collapsed "Take a note…" row that expands in place;
 * click-away saves; empty notes are discarded with a snackbar.
 */
export function Composer() {
  const { t } = useTranslation('notes');
  const m = useNoteMutations();
  const show = useSnackbarStore((s) => s.show);

  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<'text' | 'list'>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [listRows, setListRows] = useState<{ key: string; text: string }[]>([]);
  const [pinned, setPinned] = useState(false);
  const [color, setColor] = useState<NoteColor>('default');
  const [background, setBackground] = useState<NoteBackground>('none');

  // While composing, block grid/base shortcuts entirely (same as the editor
  // modal) — an open composer is an editing surface, not the board.
  useKeyScope('editor', EMPTY_BINDINGS, expanded);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const collapsedRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentM = useAttachmentMutations();

  const reset = () => {
    setExpanded(false);
    setMode('text');
    setTitle('');
    setBody('');
    setListRows([]);
    setPinned(false);
    setColor('default');
    setBackground('none');
  };

  const save = () => {
    const items = listRows
      .map((r) => r.text)
      .filter((x) => x.trim() !== '')
      .map((text) => ({ text, checked: false, indent: 0 as const }));
    const hasContent =
      title.trim() !== '' || (mode === 'text' ? body.trim() !== '' : items.length > 0);
    if (hasContent) {
      m.create.mutate({
        id: m.newNoteId(),
        type: mode,
        title: title.trim(),
        bodyHtml: mode === 'text' && body.trim() !== '' ? plainTextToHtml(body) : '',
        items: mode === 'list' ? items : [],
        pinned,
        color,
        background,
      });
    } else if (expanded) {
      show({ message: t('emptyNoteDiscarded') });
    }
    reset();
  };

  const startList = () => {
    setMode('list');
    setListRows([{ key: crypto.randomUUID(), text: '' }]);
    setExpanded(true);
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

  // Keyboard shortcuts: c → compose note, l → compose list.
  useEffect(() => {
    const onCompose = (e: Event) => {
      const kind = (e as CustomEvent<string>).detail;
      if (kind === 'list') startList();
      else {
        setMode('text');
        setExpanded(true);
      }
      window.scrollTo({ top: 0 });
    };
    document.addEventListener('openkeep:compose', onCompose);
    return () => document.removeEventListener('openkeep:compose', onCompose);
  });

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
              onClick={startList}
            />
            <IconButton
              svg={imageSvg}
              label={t('newNoteWithImage')}
              className="text-on-surface-variant"
              onClick={() => imageInputRef.current?.click()}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const id = m.newNoteId();
                void m.create
                  .mutateAsync({
                    id,
                    type: 'text',
                    title: '',
                    bodyHtml: '',
                    items: [],
                    pinned: false,
                    color: 'default',
                    background: 'none',
                  })
                  .then(() => attachmentM.upload.mutate({ noteId: id, file }));
              }}
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
            {mode === 'text' ? (
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
            ) : (
              <div className="max-h-[60vh] overflow-y-auto px-3 pb-3">
                {listRows.map((row, i) => (
                  <div key={row.key} className="group/crow flex items-center gap-2 py-0.5">
                    <input type="checkbox" disabled className="h-4 w-4 flex-none opacity-60" />
                    <input
                      // biome-ignore lint/a11y/noAutofocus: Keep focuses the first list row on entry
                      autoFocus={i === listRows.length - 1}
                      type="text"
                      value={row.text}
                      placeholder={t('editor:listItemPlaceholder')}
                      aria-label={t('editor:listItemPlaceholder')}
                      className="w-full border-transparent border-b bg-transparent px-1 py-1 text-[0.875rem] text-on-surface outline-none focus:border-(--outline)"
                      onChange={(e) =>
                        setListRows((rows) =>
                          rows.map((r) => (r.key === row.key ? { ...r, text: e.target.value } : r)),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setListRows((rows) => {
                            const idx = rows.findIndex((r) => r.key === row.key);
                            const next = [...rows];
                            next.splice(idx + 1, 0, { key: crypto.randomUUID(), text: '' });
                            return next;
                          });
                        } else if (
                          e.key === 'Backspace' &&
                          row.text === '' &&
                          listRows.length > 1
                        ) {
                          e.preventDefault();
                          setListRows((rows) => rows.filter((r) => r.key !== row.key));
                        }
                      }}
                    />
                    {listRows.length > 1 && (
                      <IconButton
                        svg={closeSvg}
                        label={t('editor:deleteItem')}
                        size={28}
                        iconSize={16}
                        className="opacity-0 group-hover/crow:opacity-100"
                        onClick={() => setListRows((rows) => rows.filter((r) => r.key !== row.key))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
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
