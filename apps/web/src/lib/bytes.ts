const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/**
 * Disk usage for humans, in the reader's locale ("1,2 MB" in pt-BR). Binary
 * steps with decimal names, the way every file manager lies about it — the
 * admin panel is comparing accounts, not auditing a filesystem.
 */
export function formatBytes(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}
