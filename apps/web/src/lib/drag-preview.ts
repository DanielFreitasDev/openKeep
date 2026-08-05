import { preserveOffsetOnSource } from '@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import type { Input } from '@atlaskit/pragmatic-drag-and-drop/types';

interface LiftedRowArgs {
  nativeSetDragImage: ((image: Element, x: number, y: number) => void) | null;
  /** The row being picked up — the preview is a copy of it. */
  element: HTMLElement;
  input: Input;
}

/**
 * Keep's lifted row: what travels with the pointer is the row itself, on an
 * elevated surface, still held exactly where it was grabbed. The browser's own
 * preview is a washed-out snapshot of the element, which next to a list that
 * re-flows live reads as a smear rather than as something picked up.
 */
export function liftedRowPreview({ nativeSetDragImage, element, input }: LiftedRowArgs): void {
  setCustomNativeDragPreview({
    nativeSetDragImage,
    getOffset: preserveOffsetOnSource({ element, input }),
    render: ({ container }) => {
      const clone = element.cloneNode(true) as HTMLElement;
      // A clone carries the markup, not what is typed into the fields — nor the
      // hover the handle and the delete button are revealed by, which the row
      // still has under the pointer.
      const live = element.querySelectorAll('input, textarea');
      clone.querySelectorAll('input, textarea').forEach((field, i) => {
        const source = live[i];
        if (field instanceof HTMLTextAreaElement && source instanceof HTMLTextAreaElement) {
          field.value = source.value;
        } else if (field instanceof HTMLInputElement && source instanceof HTMLInputElement) {
          field.value = source.value;
          field.checked = source.checked;
        }
      });
      for (const button of clone.querySelectorAll('button')) button.style.opacity = '1';
      clone.style.width = `${element.offsetWidth}px`;
      clone.style.margin = '0';
      clone.style.opacity = '1';
      clone.style.borderRadius = '4px';
      clone.style.background = 'var(--surface)';
      clone.style.boxShadow = 'var(--elevation-3)';
      container.appendChild(clone);
    },
  });
}
