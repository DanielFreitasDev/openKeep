import { Dialog } from '@base-ui/react/dialog';
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
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup
          aria-label={label}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-surface pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-(--elevation-3) outline-none"
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
