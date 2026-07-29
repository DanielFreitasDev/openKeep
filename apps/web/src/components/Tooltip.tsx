import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the anchor and the tooltip, in px (Keep uses a tight offset). */
const GAP = 6;
/** How long the pointer must rest on an anchor before the tooltip appears. */
const OPEN_DELAY = 200;
/**
 * Moving to another anchor within this window re-opens instantly — Keep's
 * toolbars feel immediate once the first tooltip has been seen.
 */
const GROUP_WINDOW = 500;

interface Anchor {
  label: string;
  rect: DOMRect;
}

/**
 * Single delegated tooltip layer, driven by the `data-tooltip` attribute.
 *
 * Delegation (rather than a wrapper component) is deliberate: `data-tooltip`
 * is a plain DOM attribute, so it rides through Base UI `Popover.Trigger` /
 * `Menu.Trigger` untouched — no render-prop composition, which is unreliable
 * in @base-ui/react 1.6 (see IconButton).
 */
export function TooltipHost() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let target: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastClosedAt = 0;

    const hide = () => {
      if (timer) clearTimeout(timer);
      if (target) lastClosedAt = performance.now();
      target = null;
      setAnchor(null);
      setPos(null);
    };

    const open = (el: HTMLElement) => {
      const label = el.dataset.tooltip;
      if (!label || !el.isConnected) return;
      setPos(null);
      setAnchor({ label, rect: el.getBoundingClientRect() });
    };

    const onOver = (e: PointerEvent) => {
      // Touch already has long-press behaviour; a hover tooltip only gets in
      // the way there.
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tooltip]') ?? null;
      if (el === target) return;
      if (timer) clearTimeout(timer);
      if (!el) {
        hide();
        return;
      }
      target = el;
      const instant = performance.now() - lastClosedAt < GROUP_WINDOW;
      if (instant) open(el);
      else timer = setTimeout(() => open(el), OPEN_DELAY);
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tooltip]') ?? null;
      // Only keyboard focus — a click already focuses the button, and Keep
      // does not show a tooltip over what you just pressed.
      if (!el?.matches(':focus-visible')) {
        hide();
        return;
      }
      if (timer) clearTimeout(timer);
      target = el;
      open(el);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Measure the popup, then place it below the anchor (above when it would
  // overflow), clamped to the viewport.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!anchor || !popup) return;
    const p = popup.getBoundingClientRect();
    const r = anchor.rect;
    let top = r.bottom + GAP;
    if (top + p.height > window.innerHeight - 4) top = Math.max(4, r.top - p.height - GAP);
    const left = Math.max(
      4,
      Math.min(r.left + r.width / 2 - p.width / 2, window.innerWidth - p.width - 4),
    );
    setPos({ top, left });
  }, [anchor]);

  if (!anchor) return null;

  return createPortal(
    <div
      ref={popupRef}
      role="presentation"
      aria-hidden
      data-testid="tooltip"
      className="pointer-events-none fixed top-0 left-0 z-[100] max-w-72 rounded bg-(--inverse-surface) px-2 py-1 font-medium text-[0.75rem] text-(--on-inverse-surface) leading-4 shadow-(--elevation-2) transition-opacity duration-75"
      style={{
        transform: `translate3d(${pos?.left ?? 0}px, ${pos?.top ?? 0}px, 0)`,
        opacity: pos ? 1 : 0,
      }}
    >
      {anchor.label}
    </div>,
    document.body,
  );
}
