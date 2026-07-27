import type { Reminder, SetReminder } from '@openkeep/shared';
import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { notes } from '../../db/schema/notes.js';
import { reminders } from '../../db/schema/reminders.js';
import { errors } from '../../lib/errors.js';
import { isValidRule, nextOccurrence } from '../../lib/recurrence.js';
import { assertNoteAccess, assertNotTrashed } from '../notes/access.js';

type ReminderRow = typeof reminders.$inferSelect;

export function toReminderDto(row: ReminderRow): Reminder {
  return {
    remindAt: row.remindAt.toISOString(),
    rrule: row.rrule,
    timezone: row.timezone,
    snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
    done: row.done,
  };
}

function assertTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw errors.badRequest(`Unknown timezone: ${tz}`);
  }
}

export async function setReminder(
  db: Db,
  userId: string,
  noteId: string,
  input: SetReminder,
): Promise<Reminder> {
  const { note } = await assertNoteAccess(db, userId, noteId);
  assertNotTrashed(note);
  assertTimezone(input.timezone);
  if (input.rrule && !isValidRule(input.rrule)) {
    throw errors.badRequest('Invalid recurrence rule');
  }

  const remindAt = new Date(input.remindAt);
  const values = {
    noteId,
    userId,
    remindAt,
    rrule: input.rrule ?? null,
    dtstart: remindAt,
    timezone: input.timezone,
    snoozedUntil: null,
    acknowledgedAt: null,
    done: false,
  };
  const [row] = await db
    .insert(reminders)
    .values(values)
    .onConflictDoUpdate({ target: [reminders.noteId, reminders.userId], set: values })
    .returning();
  return toReminderDto(row!);
}

export async function deleteReminder(db: Db, userId: string, noteId: string): Promise<void> {
  await assertNoteAccess(db, userId, noteId);
  await db.delete(reminders).where(and(eq(reminders.noteId, noteId), eq(reminders.userId, userId)));
}

export async function snoozeReminder(
  db: Db,
  userId: string,
  noteId: string,
  until: Date,
): Promise<Reminder> {
  await assertNoteAccess(db, userId, noteId);
  const [row] = await db
    .update(reminders)
    .set({ snoozedUntil: until, acknowledgedAt: null, done: false })
    .where(and(eq(reminders.noteId, noteId), eq(reminders.userId, userId)))
    .returning();
  if (!row) throw errors.notFound();
  return toReminderDto(row);
}

/** Cross-device toast dismissal for the current occurrence. */
export async function dismissReminder(db: Db, userId: string, noteId: string): Promise<void> {
  await assertNoteAccess(db, userId, noteId);
  const [row] = await db
    .update(reminders)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(reminders.noteId, noteId), eq(reminders.userId, userId)))
    .returning();
  if (!row) throw errors.notFound();
}

export interface FiredReminder {
  noteId: string;
  userId: string;
  remindAt: Date;
  noteTitle: string;
}

/**
 * Fire pass: claims due reminders with FOR UPDATE SKIP LOCKED and advances
 * them INSIDE the claiming transaction (no double-fire across instances).
 * Returns what fired so the caller can notify (WS + push).
 */
export async function fireDueReminders(db: Db, now = new Date()): Promise<FiredReminder[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.done, false),
          or(
            and(isNotNull(reminders.snoozedUntil), lte(reminders.snoozedUntil, now)),
            and(sql`${reminders.snoozedUntil} is null`, lte(reminders.remindAt, now)),
          ),
        ),
      )
      .for('update', { skipLocked: true })
      .limit(200);

    const fired: FiredReminder[] = [];
    for (const rem of due) {
      let advance: Partial<typeof reminders.$inferInsert>;
      if (rem.rrule) {
        const next = nextOccurrence({
          rrule: rem.rrule,
          dtstart: rem.dtstart,
          timezone: rem.timezone,
          after: now,
        });
        advance = next
          ? { remindAt: next, snoozedUntil: null, acknowledgedAt: null, done: false }
          : { done: true, snoozedUntil: null };
      } else {
        advance = { done: true, snoozedUntil: null };
      }
      await tx
        .update(reminders)
        .set(advance)
        .where(and(eq(reminders.noteId, rem.noteId), eq(reminders.userId, rem.userId)));

      const [note] = await tx
        .select({ title: notes.title })
        .from(notes)
        .where(eq(notes.id, rem.noteId));
      fired.push({
        noteId: rem.noteId,
        userId: rem.userId,
        remindAt: rem.snoozedUntil ?? rem.remindAt,
        noteTitle: note?.title ?? '',
      });
    }
    return fired;
  });
}
