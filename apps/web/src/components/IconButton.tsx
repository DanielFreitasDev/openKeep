import { forwardRef } from 'react';
import { Icon } from './Icon.js';

/**
 * Shared classes for Keep-style round hover icon buttons. Also used to style
 * Base UI Trigger elements directly (their `render` prop does not compose
 * reliably with Popover in @base-ui/react 1.6 — use plain Triggers instead).
 */
export const iconButtonClass =
  'inline-flex flex-none items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-(--surface-hover) focus-visible:bg-(--surface-hover) focus-visible:outline-2 focus-visible:outline-(--primary) disabled:opacity-40';

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  svg: string;
  label: string;
  size?: number;
  iconSize?: number;
}

/** Keep-style round hover icon button. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { svg, label, size = 48, iconSize = 24, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      data-tooltip={label}
      className={`${iconButtonClass} ${className ?? ''}`}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon svg={svg} size={iconSize} />
    </button>
  );
});
