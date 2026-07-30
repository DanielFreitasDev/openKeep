import closeSvg from '@material-symbols/svg-700/outlined/close.svg?raw';
import downSvg from '@material-symbols/svg-700/outlined/keyboard_arrow_down.svg?raw';
import upSvg from '@material-symbols/svg-700/outlined/keyboard_arrow_up.svg?raw';
import searchSvg from '@material-symbols/svg-700/outlined/search.svg?raw';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon.js';
import { IconButton } from '../IconButton.js';

interface FindBarProps {
  query: string;
  onQuery: (query: string) => void;
  /** Total matches in the note, and which one is highlighted (-1 for none). */
  total: number;
  index: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/**
 * The find bar, pinned above the note. Enter/Shift+Enter walk the matches
 * without the field ever losing focus (Chrome's find bar, and the reason the
 * arrows are buttons rather than only shortcuts).
 */
export function FindBar({ query, onQuery, total, index, onNext, onPrev, onClose }: FindBarProps) {
  const { t } = useTranslation('editor');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Opening on a note the user is already reading: select whatever the last
  // query was, so typing replaces it and Enter alone repeats it.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const empty = total === 0;
  return (
    <div className="flex flex-none items-center gap-1 border-(--outline-variant) border-b px-2 py-1.5">
      <Icon svg={searchSvg} size={18} className="ml-1 flex-none text-on-surface-variant" />
      <input
        ref={inputRef}
        type="text"
        data-find-input
        value={query}
        aria-label={t('findInNote')}
        placeholder={t('findInNote')}
        className="min-w-0 flex-1 bg-transparent px-2 py-1 text-on-surface text-sm outline-none placeholder:text-on-surface-variant"
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === 'Escape') {
            // The editor closes on Escape; while the bar is open it takes the
            // key for itself and hands the note back untouched.
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      />
      <span
        aria-live="polite"
        className={`flex-none px-1 text-xs tabular-nums ${
          query !== '' && empty ? 'text-red-600 dark:text-red-400' : 'text-on-surface-variant'
        }`}
      >
        {query === ''
          ? ''
          : empty
            ? t('findNoResults')
            : t('findCount', { current: index + 1, total })}
      </span>
      <IconButton
        svg={upSvg}
        label={t('findPrevious')}
        size={32}
        iconSize={18}
        disabled={empty}
        onClick={onPrev}
      />
      <IconButton
        svg={downSvg}
        label={t('findNext')}
        size={32}
        iconSize={18}
        disabled={empty}
        onClick={onNext}
      />
      <IconButton
        svg={closeSvg}
        label={t('common:close')}
        size={32}
        iconSize={18}
        onClick={onClose}
      />
    </div>
  );
}
