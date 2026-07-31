import { Popover } from '@base-ui/react/popover';
import type { Label, NoteColor } from '@openkeep/shared';
import { NOTE_COLORS } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import { useLabelMutations } from '../../hooks/use-label-mutations.js';

/**
 * Emoji a label plausibly wants. A full emoji picker is a megabyte of data for
 * a decoration — this is a shortlist, and the field beside it takes anything
 * the system keyboard can type.
 */
const QUICK_EMOJI = [
  '⭐',
  '❤️',
  '🔥',
  '✅',
  '📌',
  '💡',
  '🎯',
  '📚',
  '💼',
  '🏠',
  '🛒',
  '✈️',
  '🍽️',
  '💪',
  '🎵',
  '🐾',
];

/** The label's own dot: its colour, with the emoji taking over when set. */
export function LabelDot({ label, size = 18 }: { label: Label; size?: number }) {
  if (label.emoji) {
    return (
      <span aria-hidden style={{ fontSize: size - 2, lineHeight: 1 }}>
        {label.emoji}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block rounded-full border border-(--outline)"
      style={{ width: size - 4, height: size - 4, background: `var(--note-${label.color})` }}
    />
  );
}

/** Colour + emoji picker for one label, opened from the Edit labels dialog. */
export function LabelStyleMenu({ label, children }: { label: Label; children: React.ReactNode }) {
  const { t } = useTranslation('labels');
  const m = useLabelMutations();

  const set = (patch: { color?: NoteColor; emoji?: string | null }) =>
    m.patch.mutate({ id: label.id, patch });

  return (
    <Popover.Root>
      {children}
      <Popover.Portal>
        <Popover.Positioner className="z-60" sideOffset={4} align="start">
          <Popover.Popup className="w-60 rounded-lg border border-(--outline-variant) bg-surface p-2 shadow-(--elevation-3)">
            <div className="flex flex-wrap gap-1.5">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t(`notes:color_${c}`)}
                  data-tooltip={t(`notes:color_${c}`)}
                  aria-pressed={label.color === c && !label.emoji}
                  className={`h-7 w-7 rounded-full border transition-transform hover:scale-110 ${
                    label.color === c ? 'border-(--on-surface) border-2' : 'border-(--outline)'
                  }`}
                  style={{ background: `var(--note-${c})` }}
                  onClick={() => set({ color: c })}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1 border-(--outline-variant) border-t pt-2">
              {QUICK_EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={e}
                  aria-pressed={label.emoji === e}
                  className={`h-7 w-7 rounded text-base leading-none hover:bg-(--surface-hover) ${
                    label.emoji === e ? 'bg-(--surface-hover) ring-1 ring-(--on-surface)' : ''
                  }`}
                  onClick={() => set({ emoji: e })}
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                defaultValue={label.emoji ?? ''}
                maxLength={16}
                placeholder={t('emojiPlaceholder')}
                aria-label={t('labelEmoji')}
                className="w-16 rounded border border-(--outline) bg-transparent px-2 py-1 text-center text-on-surface text-sm outline-none focus:border-(--primary)"
                onChange={(e) => {
                  const value = e.target.value.trim();
                  set({ emoji: value === '' ? null : value });
                }}
              />
              {label.emoji && (
                <button
                  type="button"
                  className="rounded px-2 py-1 text-on-surface-variant text-sm hover:bg-(--surface-hover)"
                  onClick={() => set({ emoji: null })}
                >
                  {t('removeEmoji')}
                </button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
