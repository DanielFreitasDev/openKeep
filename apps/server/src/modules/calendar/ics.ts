/**
 * iCalendar (RFC 5545) serializer for the reminder feed. Pure: no DB, no
 * clock — the caller passes the events and the timestamp.
 */

export interface IcsEvent {
  /** Stable per occurrence: the same reminder must not duplicate on refresh. */
  uid: string;
  /** Instant of the occurrence, in UTC. */
  start: Date;
  /** Minutes; reminders are moments, so this is a nominal block. */
  durationMinutes: number;
  summary: string;
  description?: string;
  url?: string;
  /** Last modification, for clients that dedupe on it. */
  stamp: Date;
}

/** RFC 5545 date-time in UTC: 20260731T120000Z. */
export function icsDate(date: Date): string {
  return `${date.toISOString().replaceAll(/[-:]/g, '').slice(0, 15)}Z`;
}

/**
 * Text escaping per §3.3.11 — backslash first, or it would escape the escapes
 * the other replacements just wrote.
 */
export function icsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\r|\n/g, '\\n');
}

/**
 * Content lines are limited to 75 OCTETS, and the split may not land inside a
 * UTF-8 sequence or clients render mojibake — so the fold counts encoded bytes
 * and breaks on code-point boundaries.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = '';
  let bytes = 0;
  // The continuation octet counts against the next line's 75, hence 74.
  let budget = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > budget) {
      out.push(current);
      current = '';
      bytes = 0;
      budget = 74;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendar(name: string, events: IcsEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OpenKeep//Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    `NAME:${icsText(name)}`,
    // Subscribers poll; say how often so they do not hammer or go stale.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${icsDate(event.stamp)}`,
      `DTSTART:${icsDate(event.start)}`,
      `DURATION:PT${event.durationMinutes}M`,
      `SUMMARY:${icsText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${icsText(event.description)}`);
    if (event.url) lines.push(`URL:${event.url}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
