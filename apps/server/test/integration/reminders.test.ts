import type { FullNote, Reminder } from '@openkeep/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { noteMembers } from '../../src/db/schema/notes.js';
import { reminders } from '../../src/db/schema/reminders.js';
import { fireDueReminders } from '../../src/modules/reminders/service.js';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

const TZ = 'America/Fortaleza';

describe('reminders', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('rem@example.com', 'Rem');
  });
  afterAll(async () => {
    await t.close();
  });

  const createNote = async (title: string) => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title },
    });
    return res.json() as FullNote;
  };

  const setReminder = async (noteId: string, body: Record<string, unknown>) =>
    t.app.inject({
      method: 'PUT',
      url: `/api/notes/${noteId}/reminder`,
      headers: { cookie },
      payload: body,
    });

  it('sets, reads (in FullNote), updates and deletes a reminder', async () => {
    const note = await createNote('Remind me');
    const at = new Date(Date.now() + 3600_000).toISOString();

    const set = await setReminder(note.id, { remindAt: at, timezone: TZ });
    expect(set.statusCode).toBe(200);
    expect((set.json() as Reminder).remindAt).toBe(at);

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const full = (list.json() as FullNote[]).find((n) => n.id === note.id);
    expect(full?.reminder?.remindAt).toBe(at);
    expect(full?.reminder?.rrule).toBeNull();

    const recur = await setReminder(note.id, { remindAt: at, timezone: TZ, rrule: 'FREQ=DAILY' });
    expect((recur.json() as Reminder).rrule).toBe('FREQ=DAILY');

    const del = await t.app.inject({
      method: 'DELETE',
      url: `/api/notes/${note.id}/reminder`,
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
  });

  it('rejects bad timezones and rules', async () => {
    const note = await createNote('Bad inputs');
    const badTz = await setReminder(note.id, {
      remindAt: new Date().toISOString(),
      timezone: 'Mars/Olympus',
    });
    expect(badTz.statusCode).toBe(400);
    const badRule = await setReminder(note.id, {
      remindAt: new Date().toISOString(),
      timezone: TZ,
      rrule: 'FREQ=SOMETIMES',
    });
    expect(badRule.statusCode).toBe(400);
  });

  it('one-shot fire marks done; recurring advances past now', async () => {
    const oneShot = await createNote('One shot');
    const recurring = await createNote('Recurring');
    const past = new Date(Date.now() - 60_000).toISOString();

    await setReminder(oneShot.id, { remindAt: past, timezone: TZ });
    await setReminder(recurring.id, { remindAt: past, timezone: TZ, rrule: 'FREQ=DAILY' });

    const fired = await fireDueReminders(t.db);
    const firedIds = fired.map((f) => f.noteId);
    expect(firedIds).toContain(oneShot.id);
    expect(firedIds).toContain(recurring.id);

    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const notes = list.json() as FullNote[];
    const one = notes.find((n) => n.id === oneShot.id)!;
    const rec = notes.find((n) => n.id === recurring.id)!;
    expect(one.reminder?.done).toBe(true);
    expect(rec.reminder?.done).toBe(false);
    expect(new Date(rec.reminder!.remindAt).getTime()).toBeGreaterThan(Date.now());

    // Second pass fires nothing (no double fire).
    const again = await fireDueReminders(t.db);
    expect(again.map((f) => f.noteId)).not.toContain(oneShot.id);
    expect(again.map((f) => f.noteId)).not.toContain(recurring.id);
  });

  it('snooze defers firing until the snooze time', async () => {
    const note = await createNote('Snoozed');
    const past = new Date(Date.now() - 60_000).toISOString();
    await setReminder(note.id, { remindAt: past, timezone: TZ });

    const until = new Date(Date.now() + 3600_000);
    const snooze = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/reminder/snooze`,
      headers: { cookie },
      payload: { until: until.toISOString() },
    });
    expect(snooze.statusCode).toBe(200);

    const fired = await fireDueReminders(t.db);
    expect(fired.map((f) => f.noteId)).not.toContain(note.id);

    const late = await fireDueReminders(t.db, new Date(until.getTime() + 1000));
    expect(late.map((f) => f.noteId)).toContain(note.id);
  });

  it('dismiss stamps acknowledgedAt', async () => {
    const note = await createNote('Dismiss me');
    await setReminder(note.id, { remindAt: new Date().toISOString(), timezone: TZ });
    const res = await t.app.inject({
      method: 'POST',
      url: `/api/notes/${note.id}/reminder/dismiss`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(204);
    const [row] = await t.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.noteId, note.id)));
    expect(row?.acknowledgedAt).not.toBeNull();
  });

  it('reminders are per-user on shared notes (isolation)', async () => {
    const other = await t.signUp('rem-other@example.com', 'Other');
    const note = await createNote('Shared reminder');

    const session = await t.app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: other },
    });
    const otherId = session.json().user.id as string;
    await t.db.insert(noteMembers).values({
      noteId: note.id,
      userId: otherId,
      role: 'collaborator',
      position: 'zz',
    });

    // Collaborator sets THEIR reminder.
    const set = await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${note.id}/reminder`,
      headers: { cookie: other },
      payload: { remindAt: new Date(Date.now() + 3600_000).toISOString(), timezone: TZ },
    });
    expect(set.statusCode).toBe(200);

    // Owner sees NO reminder on the note.
    const list = await t.app.inject({ method: 'GET', url: '/api/notes', headers: { cookie } });
    const mine = (list.json() as FullNote[]).find((n) => n.id === note.id);
    expect(mine?.reminder).toBeNull();
  });

  it('search type=reminder finds notes with my reminder', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/search?type=reminder',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const titles = (res.json() as FullNote[]).map((n) => n.title);
    // 'Remind me' deleted its reminder in the first test; these still have one.
    expect(titles).toContain('Snoozed');
    expect(titles).toContain('One shot');
    expect(titles).not.toContain('Remind me');
  });

  it('push subscription CRUD', async () => {
    const sub = {
      endpoint: 'https://push.example.com/ep/123',
      keys: { p256dh: 'k'.repeat(20), auth: 'a'.repeat(10) },
    };
    const add = await t.app.inject({
      method: 'POST',
      url: '/api/push/subscriptions',
      headers: { cookie },
      payload: sub,
    });
    expect(add.statusCode).toBe(204);

    const del = await t.app.inject({
      method: 'DELETE',
      url: '/api/push/subscriptions',
      headers: { cookie },
      payload: { endpoint: sub.endpoint },
    });
    expect(del.statusCode).toBe(204);
  });
});
