import { Icon } from './Icon.js';

/** Keep-style empty state: big faded icon + caption, centered in the view. */
export function EmptyView({ svg, text }: { svg: string; text: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-on-surface-variant">
      <Icon svg={svg} size={120} className="opacity-30" />
      <p className="text-xl">{text}</p>
    </div>
  );
}
