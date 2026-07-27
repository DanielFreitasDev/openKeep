import rrulePkg from 'rrule';

// rrule ships CJS; the named export only exists via interop in some loaders.
const { RRule } = rrulePkg;

/**
 * Recurrence wrapper — the ONLY module that touches the dormant `rrule` lib.
 *
 * Strategy: never use rrule's tzid path (known DST quirks). All expansion
 * happens in "fake UTC" wall-clock space for the reminder's IANA zone; we
 * convert real→wall before and wall→real after. Wall time stays stable across
 * DST transitions by construction.
 */

interface WallParts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    partsCache.set(tz, f);
  }
  return f;
}

export function utcToWall(date: Date, tz: string): WallParts {
  const parts = formatterFor(tz).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get('year'),
    mo: get('month'),
    d: get('day'),
    h: get('hour') % 24,
    mi: get('minute'),
    s: get('second'),
  };
}

/** Interpret wall-clock parts in `tz` as a real UTC instant (two-pass offset). */
export function wallToUtc(tz: string, w: WallParts): Date {
  const guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  const offset1 = offsetAt(new Date(guess), tz);
  const second = guess - offset1;
  const offset2 = offsetAt(new Date(second), tz);
  return new Date(guess - offset2);
}

function offsetAt(date: Date, tz: string): number {
  const w = utcToWall(date, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - date.getTime();
}

function toFakeUtc(date: Date, tz: string): Date {
  const w = utcToWall(date, tz);
  return new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s));
}

function fromFakeUtc(fake: Date, tz: string): Date {
  return wallToUtc(tz, {
    y: fake.getUTCFullYear(),
    mo: fake.getUTCMonth() + 1,
    d: fake.getUTCDate(),
    h: fake.getUTCHours(),
    mi: fake.getUTCMinutes(),
    s: fake.getUTCSeconds(),
  });
}

/** Parses + validates an RRULE body; throws on unsupported input. */
export function parseRule(rruleBody: string): ReturnType<typeof RRule.parseString> {
  const options = RRule.parseString(`RRULE:${rruleBody}`);
  if (!options.freq && options.freq !== 0) throw new Error('RRULE must declare FREQ');
  return options;
}

export function isValidRule(rruleBody: string): boolean {
  try {
    parseRule(rruleBody);
    return true;
  } catch {
    return false;
  }
}

/**
 * Next occurrence strictly after `after`, expanded in the reminder's zone.
 * Returns null when the rule is exhausted (COUNT/UNTIL).
 */
export function nextOccurrence(opts: {
  rrule: string;
  dtstart: Date;
  timezone: string;
  after: Date;
}): Date | null {
  const parsed = parseRule(opts.rrule);
  const rule = new RRule({ ...parsed, dtstart: toFakeUtc(opts.dtstart, opts.timezone) });
  const fakeNext = rule.after(toFakeUtc(opts.after, opts.timezone), false);
  if (!fakeNext) return null;
  return fromFakeUtc(fakeNext, opts.timezone);
}
