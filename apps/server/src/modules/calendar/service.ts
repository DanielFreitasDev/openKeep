import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notes } from '../../db/schema/notes.js';
import { reminders } from '../../db/schema/reminders.js';
import { userSettings } from '../../db/schema/settings.js';
import { occurrencesBetween } from '../../lib/recurrence.js';
import type { IcsEvent } from './ics.js';
import { buildCalendar } from './ics.js';

/** How far back and forward the feed projects, and the per-rule ceiling. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 365;
const MAX_OCCURRENCES = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A reminder is a moment; calendars want a block, so give it a nominal one. */
const DURATION_MINUTES = 30;
const SUMMARY_MAX = 120;
const DESCRIPTION_MAX = 500;

/**
 * The URL is the credential, so it is stored as-is: the point of a feed is
 * that the same address keeps working in whatever calendar app the user
 * subscribed with, which a one-time-reveal hash could not do. Rotating (or
 * clearing) the token revokes every subscription at once.
 */
export async function getCalendarToken(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ token: userSettings.calendarToken })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row?.token ?? null;
}

export async function rotateCalendarToken(db: Db, userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await db
    .insert(userSettings)
    .values({ userId, calendarToken: token })
    .onConflictDoUpdate({ target: userSettings.userId, set: { calendarToken: token } });
  return token;
}

export async function revokeCalendarToken(db: Db, userId: string): Promise<void> {
  await db.update(userSettings).set({ calendarToken: null }).where(eq(userSettings.userId, userId));
}

export async function userIdForCalendarToken(db: Db, token: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.calendarToken, token))
    .limit(1);
  return row?.userId ?? null;
}

function firstLine(text: string): string {
  return (
    text
      .split('\n')
      .find((l) => l.trim() !== '')
      ?.trim() ?? ''
  );
}

/**
 * The feed as VEVENTs. Recurrence is EXPANDED here rather than exported as an
 * RRULE: a recurring reminder keeps wall-clock time across DST (DECISIONS —
 * rrule in fake-UTC space), and reproducing that in iCalendar would mean
 * shipping a VTIMEZONE with the zone's transition rules per user. Expanding
 * into plain UTC instants is correct by construction and uses the same
 * expander the fire job does. The cost is that the feed is a projection —
 * hence the one-hour refresh hint in the calendar header.
 */
export async function buildCalendarFeed(
  db: Db,
  userId: string,
  appUrl: string,
  now: Date,
): Promise<string> {
  const rows = await db
    .select({
      noteId: reminders.noteId,
      remindAt: reminders.remindAt,
      snoozedUntil: reminders.snoozedUntil,
      rrule: reminders.rrule,
      dtstart: reminders.dtstart,
      timezone: reminders.timezone,
      updatedAt: reminders.updatedAt,
      title: notes.title,
      bodyText: notes.bodyText,
    })
    .from(reminders)
    .innerJoin(notes, eq(reminders.noteId, notes.id))
    .where(and(eq(reminders.userId, userId), isNull(notes.trashedAt)));

  const from = new Date(now.getTime() - PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + FUTURE_DAYS * DAY_MS);
  const events: IcsEvent[] = [];

  for (const row of rows) {
    const summary = (row.title.trim() || firstLine(row.bodyText) || 'Reminder').slice(
      0,
      SUMMARY_MAX,
    );
    const description = row.bodyText.trim().slice(0, DESCRIPTION_MAX);
    const base = {
      durationMinutes: DURATION_MINUTES,
      summary,
      ...(description === '' ? {} : { description }),
      // `?note=` is the app's stable deep link (DECISIONS #13), so the event
      // in a calendar client opens the note it came from.
      url: new URL(`/?note=${row.noteId}`, appUrl).toString(),
      stamp: row.updatedAt,
    };

    if (row.rrule === null) {
      // A snoozed one-shot shows where it will actually fire.
      const start = row.snoozedUntil ?? row.remindAt;
      if (start >= from && start <= to) {
        events.push({ ...base, uid: uidFor(row.noteId, start), start });
      }
      continue;
    }

    let occurrences: Date[];
    try {
      occurrences = occurrencesBetween({
        rrule: row.rrule,
        dtstart: row.dtstart,
        timezone: row.timezone,
        from,
        to,
        limit: MAX_OCCURRENCES,
      });
    } catch {
      // A rule the expander rejects must not take the whole feed down with it.
      occurrences = [];
    }
    for (const start of occurrences) {
      events.push({ ...base, uid: uidFor(row.noteId, start), start });
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return buildCalendar('OpenKeep', events);
}

/** Stable per occurrence, so a refresh updates events instead of cloning them. */
function uidFor(noteId: string, start: Date): string {
  return `${noteId}-${start.getTime()}@openkeep`;
}
