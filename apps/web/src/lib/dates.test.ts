import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCreatedTooltip, formatEdited, formatReminderTime } from './dates.js';

/** Frozen clock: Tue 2026-07-28 15:00 local. */
const NOW = new Date(2026, 6, 28, 15, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const iso = (d: Date) => d.toISOString();

describe('formatEdited (Keep relative rules)', () => {
  it('shows only the time for today', () => {
    const today = new Date(2026, 6, 28, 9, 5);
    expect(formatEdited(iso(today), 'en')).toBe('9:05 AM');
    expect(formatEdited(iso(today), 'pt-BR')).toBe('09:05');
  });

  it('prefixes yesterday in each language', () => {
    const yesterday = new Date(2026, 6, 27, 22, 30);
    expect(formatEdited(iso(yesterday), 'en')).toBe('yesterday, 10:30 PM');
    expect(formatEdited(iso(yesterday), 'pt-BR')).toBe('ontem, 22:30');
  });

  it('shows day + month within the current year, localized', () => {
    const march = new Date(2026, 2, 14, 10, 0);
    expect(formatEdited(iso(march), 'en')).toBe('14 Mar');
    expect(formatEdited(iso(march), 'pt-BR')).toBe('14 mar');
  });

  it('adds the year for older dates', () => {
    const old = new Date(2024, 11, 25, 10, 0);
    expect(formatEdited(iso(old), 'en')).toBe('25 Dec 2024');
    expect(formatEdited(iso(old), 'pt-BR')).toBe('25 dez 2024');
  });
});

describe('formatReminderTime', () => {
  it('time only when today', () => {
    const today = new Date(2026, 6, 28, 18, 0);
    expect(formatReminderTime(iso(today), 'en')).toBe('6:00 PM');
    expect(formatReminderTime(iso(today), 'pt-BR')).toBe('18:00');
  });

  it('day + month + time within the year; year added otherwise', () => {
    const aug = new Date(2026, 7, 2, 8, 0);
    expect(formatReminderTime(iso(aug), 'en')).toBe('2 Aug, 8:00 AM');
    expect(formatReminderTime(iso(aug), 'pt-BR')).toBe('2 ago, 08:00');
    const next = new Date(2027, 0, 1, 8, 0);
    expect(formatReminderTime(iso(next), 'en')).toBe('1 Jan 2027, 8:00 AM');
    expect(formatReminderTime(iso(next), 'pt-BR')).toBe('1 jan 2027, 08:00');
  });
});

describe('formatCreatedTooltip', () => {
  it('localizes the label and the full date', () => {
    const created = new Date(2026, 6, 1, 14, 30);
    expect(formatCreatedTooltip(iso(created), 'en')).toMatch(/^Created Jul 1, 2026/);
    expect(formatCreatedTooltip(iso(created), 'pt-BR')).toMatch(/^Criada em 1 jul 2026/);
  });
});
