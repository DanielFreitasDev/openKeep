import { Dialog } from '@base-ui/react/dialog';
import { useMountTransition } from '../hooks/use-mount-transition.js';
import { Icon } from './Icon.js';

/**
 * Mobile bottom sheet (Keep-app surface for menus and pickers). Callers keep
 * its triggers under `md:hidden`, so it never opens on desktop layouts.
 */
export function BottomSheet({
  open,
  onOpenChange,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  // The popup's slide is driven by Base UI's starting/ending styles, which
  // also keep the portal (and therefore this scrim) mounted through the exit —
  // the scrim only needs the open/closed flag to fade against.
  const { entered } = useMountTransition(open, 210);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Not Dialog.Backdrop: Base UI drops that on nested dialogs (the
            editor modal is itself a Dialog), which left sheets with no scrim —
            taps outside leaked into the editor and nothing dismissed. An owned
            scrim keeps tap-outside-to-close working (Keep-app behavior). */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss is a pointer affordance; Esc closes too */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users close the sheet with Esc, not the scrim */}
        <div
          className="motion-scrim fixed inset-0 z-50 bg-(--scrim)"
          data-entered={entered || undefined}
          onClick={() => onOpenChange(false)}
        />
        <Dialog.Popup
          aria-label={label}
          className="sheet-panel fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-(--elevation-3) outline-none"
        >
          {children}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One tappable sheet row: leading icon + label (Keep-app list style). */
export function SheetItem({
  svg,
  label,
  onClick,
}: {
  svg: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center gap-5 px-6 text-left text-[0.9rem] text-on-surface outline-none hover:bg-(--surface-hover) focus-visible:bg-(--surface-hover)"
    >
      <Icon svg={svg} size={22} className="text-on-surface-variant" />
      <span className="truncate">{label}</span>
    </button>
  );
}
