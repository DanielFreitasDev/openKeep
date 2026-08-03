import { Select as BaseSelect } from '@base-ui/react/select';
import arrowDropDownSvg from '@material-symbols/svg-700/outlined/arrow_drop_down.svg?raw';
import checkSvg from '@material-symbols/svg-700/outlined/check.svg?raw';
import { Icon } from './Icon.js';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  /** Accessible name — visible above the trigger with `showLabel`, an `aria-label` otherwise. */
  label: string;
  showLabel?: boolean;
  /** `sm` is the chip that sits beside a field; `md` matches the text inputs. */
  size?: 'sm' | 'md';
  onChange: (value: T) => void;
  /** Goes on the trigger — layout (widths, `flex-1`) belongs to the caller. */
  className?: string;
}

const TRIGGER_SIZE = {
  sm: 'py-1 pr-1 pl-2 text-xs text-on-surface-variant border-(--outline-variant)',
  md: 'py-1.5 pr-1.5 pl-2 text-sm text-on-surface border-(--outline)',
} as const;

/**
 * The app's own dropdown, replacing `<select>`: the native control paints its
 * popup with the OS palette, which reads as a foreign element in dark mode.
 * Values are strings so the trigger label comes straight from `options`.
 */
export function Select<T extends string>({
  value,
  options,
  label,
  showLabel = false,
  size = 'sm',
  onChange,
  className,
}: SelectProps<T>) {
  return (
    <BaseSelect.Root items={options} value={value} onValueChange={(next) => onChange(next as T)}>
      {/* Only wraps when there is a label to stack above the trigger, so an
          unlabelled select stays a plain inline child of the caller's layout. */}
      <Wrapper wrap={showLabel}>
        {showLabel && (
          <BaseSelect.Label className="text-on-surface-variant text-xs">{label}</BaseSelect.Label>
        )}
        <BaseSelect.Trigger
          aria-label={showLabel ? undefined : label}
          className={`flex cursor-default items-center justify-between gap-1 rounded border bg-transparent transition-colors hover:bg-(--surface-hover) focus-visible:border-(--primary) focus-visible:outline-2 focus-visible:outline-(--primary) data-[popup-open]:border-(--primary) ${TRIGGER_SIZE[size]} ${className ?? ''}`}
        >
          <BaseSelect.Value />
          <BaseSelect.Icon className="flex">
            <Icon svg={arrowDropDownSvg} size={16} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </Wrapper>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="z-50"
          sideOffset={4}
          // Off, so the popup never covers the trigger it belongs to.
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className="max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto rounded-lg border border-(--outline-variant) bg-surface py-1.5 shadow-(--elevation-3)">
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                className="flex cursor-default select-none items-center gap-2 py-2 pr-4 pl-2 text-on-surface text-sm outline-none data-[highlighted]:bg-(--surface-hover)"
              >
                <BaseSelect.ItemIndicator
                  // Kept mounted so the label column does not shift on select.
                  keepMounted
                  className="invisible flex w-5 flex-none justify-center text-primary data-[selected]:visible"
                >
                  <Icon svg={checkSvg} size={16} />
                </BaseSelect.ItemIndicator>
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

function Wrapper({ wrap, children }: { wrap: boolean; children: React.ReactNode }) {
  return wrap ? <div className="flex flex-col gap-1">{children}</div> : children;
}
