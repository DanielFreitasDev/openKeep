import type { Box } from './marquee.js';

/**
 * The rubber-band box itself: page-positioned (its coords come from the drag in
 * page space) and inert, so it never steals the pointer mid-drag.
 */
export function MarqueeOverlay({ box }: { box: Box | null }) {
  if (!box) return null;
  return (
    <div
      aria-hidden
      data-testid="marquee"
      className="pointer-events-none absolute z-30 rounded-[2px] border border-(--outline) bg-(--surface-hover)"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
    />
  );
}
