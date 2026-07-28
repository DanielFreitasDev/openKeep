import { describe, expect, it } from 'vitest';
import { isValidRule, nextOccurrence, utcToWall, wallToUtc } from './recurrence.js';

const NY = 'America/New_York';
const SP = 'America/Sao_Paulo';

describe('wall/UTC conversion', () => {
  it('round-trips standard times', () => {
    const utc = wallToUtc(NY, { y: 2026, mo: 1, d: 15, h: 8, mi: 0, s: 0 });
    expect(utc.toISOString()).toBe('2026-01-15T13:00:00.000Z'); // EST = UTC-5
    expect(utcToWall(utc, NY)).toMatchObject({ h: 8, mi: 0 });
  });

  it('handles DST (EDT = UTC-4)', () => {
    const utc = wallToUtc(NY, { y: 2026, mo: 7, d: 15, h: 8, mi: 0, s: 0 });
    expect(utc.toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });
});

describe('nextOccurrence', () => {
  const at = (iso: string) => new Date(iso);

  it('honors custom INTERVAL (every 2 weeks)', () => {
    const dtstart = wallToUtc(SP, { y: 2026, mo: 1, d: 5, h: 9, mi: 0, s: 0 });
    const next = nextOccurrence({
      rrule: 'FREQ=WEEKLY;INTERVAL=2',
      dtstart,
      timezone: SP,
      after: dtstart,
    });
    expect(utcToWall(next!, SP)).toMatchObject({ y: 2026, mo: 1, d: 19, h: 9, mi: 0 });

    const daily3 = nextOccurrence({
      rrule: 'FREQ=DAILY;INTERVAL=3',
      dtstart,
      timezone: SP,
      after: next!,
    });
    // Grid counts from dtstart: Jan 5 + 3-day steps → Jan 20 is the first after Jan 19.
    expect(utcToWall(daily3!, SP)).toMatchObject({ mo: 1, d: 20 });
  });

  it('daily keeps wall time across the spring-forward transition (NY, Mar 8 2026)', () => {
    // 08:00 NY daily. Mar 7 = EST (UTC-5) → 13:00Z; Mar 8 = EDT (UTC-4) → 12:00Z.
    const dtstart = wallToUtc(NY, { y: 2026, mo: 3, d: 6, h: 8, mi: 0, s: 0 });
    const afterMar7 = at('2026-03-07T14:00:00.000Z');
    const next = nextOccurrence({ rrule: 'FREQ=DAILY', dtstart, timezone: NY, after: afterMar7 });
    expect(next?.toISOString()).toBe('2026-03-08T12:00:00.000Z');
    expect(utcToWall(next!, NY)).toMatchObject({ h: 8, mi: 0 });
  });

  it('daily keeps wall time across fall-back (NY, Nov 1 2026)', () => {
    const dtstart = wallToUtc(NY, { y: 2026, mo: 10, d: 30, h: 8, mi: 0, s: 0 });
    const next = nextOccurrence({
      rrule: 'FREQ=DAILY',
      dtstart,
      timezone: NY,
      after: at('2026-10-31T13:00:00.000Z'),
    });
    // Nov 1 EST again (UTC-5) → 13:00Z.
    expect(next?.toISOString()).toBe('2026-11-01T13:00:00.000Z');
    expect(utcToWall(next!, NY)).toMatchObject({ h: 8 });
  });

  it('monthly on the 31st skips short months (RFC default)', () => {
    const dtstart = wallToUtc(SP, { y: 2026, mo: 1, d: 31, h: 9, mi: 0, s: 0 });
    const next = nextOccurrence({
      rrule: 'FREQ=MONTHLY',
      dtstart,
      timezone: SP,
      after: dtstart,
    });
    // February has no 31st → March 31.
    expect(utcToWall(next!, SP)).toMatchObject({ mo: 3, d: 31, h: 9 });
  });

  it('yearly Feb 29 only lands on leap years', () => {
    const dtstart = wallToUtc(SP, { y: 2024, mo: 2, d: 29, h: 10, mi: 0, s: 0 });
    const next = nextOccurrence({
      rrule: 'FREQ=YEARLY',
      dtstart,
      timezone: SP,
      after: at('2024-03-01T00:00:00.000Z'),
    });
    expect(utcToWall(next!, SP)).toMatchObject({ y: 2028, mo: 2, d: 29 });
  });

  it('weekly with interval', () => {
    const dtstart = wallToUtc(NY, { y: 2026, mo: 7, d: 6, h: 18, mi: 30, s: 0 }); // Monday
    const next = nextOccurrence({
      rrule: 'FREQ=WEEKLY;INTERVAL=2',
      dtstart,
      timezone: NY,
      after: at('2026-07-07T00:00:00.000Z'),
    });
    expect(utcToWall(next!, NY)).toMatchObject({ mo: 7, d: 20, h: 18, mi: 30 });
  });

  it('COUNT-limited rules exhaust to null', () => {
    const dtstart = wallToUtc(NY, { y: 2026, mo: 7, d: 1, h: 8, mi: 0, s: 0 });
    const next = nextOccurrence({
      rrule: 'FREQ=DAILY;COUNT=2',
      dtstart,
      timezone: NY,
      after: at('2026-07-02T13:00:00.000Z'),
    });
    expect(next).toBeNull();
  });

  it('validates rule strings', () => {
    expect(isValidRule('FREQ=DAILY;INTERVAL=3')).toBe(true);
    expect(isValidRule('gibberish')).toBe(false);
    expect(isValidRule('INTERVAL=2')).toBe(false);
  });
});
