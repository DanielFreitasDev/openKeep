interface IconProps {
  /** Raw SVG markup from a @material-symbols/svg-700 `?raw` import. */
  svg: string;
  /** Accessible name; omit ONLY when the parent control is already labeled. */
  label?: string;
  /** Pixel size (width = height). */
  size?: number;
  className?: string;
}

/**
 * Material Symbol rendered inline so it inherits `currentColor`.
 * Enforces explicit a11y: either a label or decorative (aria-hidden).
 */
export function Icon({ svg, label, size = 24, className }: IconProps) {
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  return (
    <span
      className={`msym ${className ?? ''}`}
      style={{ width: size, height: size }}
      {...a11y}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static build-time SVG assets
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
