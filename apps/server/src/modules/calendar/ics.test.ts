import { describe, expect, it } from 'vitest';
import { buildCalendar, foldLine, icsDate, icsText } from './ics.js';

describe('ics serializer', () => {
  it('formats UTC date-times', () => {
    expect(icsDate(new Date('2026-07-31T12:34:56.789Z'))).toBe('20260731T123456Z');
  });

  it('escapes the characters RFC 5545 reserves', () => {
    expect(icsText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
    // Backslash first, or the escapes would escape each other.
    expect(icsText('back\\slash, and comma')).toBe('back\\\\slash\\, and comma');
    expect(icsText('line one\nline two')).toBe('line one\\nline two');
    expect(icsText('crlf\r\nhere')).toBe('crlf\\nhere');
  });

  it('leaves short lines alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds long lines at 75 octets with a leading space', () => {
    const folded = foldLine(`SUMMARY:${'a'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toHaveLength(75);
    for (const line of lines.slice(1)) {
      expect(line.startsWith(' ')).toBe(true);
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(folded.replaceAll('\r\n ', '')).toBe(`SUMMARY:${'a'.repeat(200)}`);
  });

  it('never splits a multi-byte character', () => {
    // Emoji are 4 octets: a naive 75-CHARACTER fold would cut one in half.
    const folded = foldLine(`SUMMARY:${'🍎'.repeat(40)}`);
    for (const line of folded.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(folded.replaceAll('\r\n ', '')).toBe(`SUMMARY:${'🍎'.repeat(40)}`);
    expect(folded).not.toContain('�');
  });

  it('builds a calendar with CRLF line endings and a refresh hint', () => {
    const ics = buildCalendar('OpenKeep', [
      {
        uid: 'note-1@openkeep',
        start: new Date('2026-08-01T09:00:00Z'),
        durationMinutes: 30,
        summary: 'Water the plants',
        description: 'the big ones',
        url: 'https://keep.example.com/?note=abc',
        stamp: new Date('2026-07-31T00:00:00Z'),
      },
    ]);

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(ics).toContain('UID:note-1@openkeep');
    expect(ics).toContain('DTSTART:20260801T090000Z');
    expect(ics).toContain('DURATION:PT30M');
    expect(ics).toContain('SUMMARY:Water the plants');
    expect(ics).toContain('URL:https://keep.example.com/?note=abc');
    expect(ics.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('omits DESCRIPTION and URL when there is nothing to say', () => {
    const ics = buildCalendar('OpenKeep', [
      {
        uid: 'u@openkeep',
        start: new Date('2026-08-01T09:00:00Z'),
        durationMinutes: 30,
        summary: 'Bare',
        stamp: new Date('2026-07-31T00:00:00Z'),
      },
    ]);
    expect(ics).not.toContain('DESCRIPTION');
    expect(ics).not.toContain('URL:');
  });
});
