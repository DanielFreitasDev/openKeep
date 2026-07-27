import checkSvg from '@material-symbols/svg-400/outlined/check.svg?raw';
import dropletSvg from '@material-symbols/svg-400/outlined/water_drop.svg?raw';
import type { NoteBackground, NoteColor } from '@openkeep/shared';
import { NOTE_BACKGROUNDS, NOTE_COLORS } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon.js';
import { NoteBackgroundArt } from './NoteBackground.js';

interface ColorPickerProps {
  color: NoteColor;
  background: NoteBackground;
  onColor: (c: NoteColor) => void;
  onBackground: (b: NoteBackground) => void;
}

/** Keep's color/background palette panel (12 swatches + 10 backgrounds). */
export function ColorPicker({ color, background, onColor, onBackground }: ColorPickerProps) {
  const { t } = useTranslation('notes');

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('colorOptions')}>
        {NOTE_COLORS.map((c) => {
          const selected = c === color;
          return (
            <button
              key={c}
              type="button"
              // biome-ignore lint/a11y/useSemanticElements: ARIA radio-button pattern (visual swatch, instant apply)
              role="radio"
              aria-checked={selected}
              aria-label={t(`color_${c}`)}
              title={t(`color_${c}`)}
              onClick={() => onColor(c)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 ${
                selected
                  ? 'border-(--primary)'
                  : c === 'default'
                    ? 'border-(--outline)'
                    : 'border-transparent'
              }`}
              style={{ background: `var(--note-${c})` }}
            >
              {selected && (
                <span className="-top-1.5 -right-1.5 absolute flex h-4 w-4 items-center justify-center rounded-full bg-primary text-on-primary">
                  <Icon svg={checkSvg} size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('backgroundOptions')}>
        {NOTE_BACKGROUNDS.map((b) => {
          const selected = b === background;
          return (
            <button
              key={b}
              type="button"
              // biome-ignore lint/a11y/useSemanticElements: ARIA radio-button pattern (visual swatch, instant apply)
              role="radio"
              aria-checked={selected}
              aria-label={t(`background_${b}`)}
              title={t(`background_${b}`)}
              onClick={() => onBackground(b)}
              className={`relative h-10 w-10 overflow-hidden rounded-full border-2 ${
                selected ? 'border-(--primary)' : 'border-(--outline)'
              } bg-surface transition-transform hover:scale-105`}
            >
              {b === 'none' ? (
                <span className="flex h-full w-full items-center justify-center text-on-surface-variant">
                  <Icon svg={dropletSvg} size={18} />
                </span>
              ) : (
                <span className="absolute inset-0 scale-[1.7]">
                  <NoteBackgroundArt background={b} />
                </span>
              )}
              {selected && (
                <span className="-top-0.5 -right-0.5 absolute flex h-4 w-4 items-center justify-center rounded-full bg-primary text-on-primary">
                  <Icon svg={checkSvg} size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
