import type { FullNote } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

describe('calendar feed', () => {
  let t: TestApp;
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('calendar@example.com', 'Cal');
  });
  afterAll(async () => {
    await t.close();
  });

  const noteWithReminder = async (
    title: string,
    reminder: { remindAt: string; rrule?: string; timezone?: string },
  ) => {
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: { cookie },
      payload: { title, bodyHtml: `<p>${title} body</p>` },
    });
    const note = created.json() as FullNote;
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/notes/${note.id}/reminder`,
      headers: { cookie },
      payload: { timezone: 'America/Fortaleza', ...reminder },
    });
    expect(res.statusCode).toBe(200);
    return note;
  };

  const tokenUrl = async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/calendar/token',
      headers: { cookie },
    });
    return (res.json() as { url: string | null }).url;
  };

  it('has no feed until one is asked for', async () => {
    expect(await tokenUrl()).toBeNull();
  });

  it('serves the reminders of the token holder as iCalendar', async () => {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const note = await noteWithReminder('Water the plants', { remindAt: soon });

    const created = await t.app.inject({
      method: 'POST',
      url: '/api/calendar/token',
      headers: { cookie },
    });
    expect(created.statusCode).toBe(200);
    const url = (created.json() as { url: string }).url;
    expect(url).toMatch(/^http.*\/api\/calendar\/[A-Za-z0-9_-]+\.ics$/);
    // The GET now reports the same URL — it is stored, not one-shot.
    expect(await tokenUrl()).toBe(url);

    // No session: a calendar client has none, the path is the credential.
    const feed = await t.app.inject({ method: 'GET', url: new URL(url).pathname });
    expect(feed.statusCode).toBe(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.body).toContain('BEGIN:VCALENDAR');
    expect(feed.body).toContain('SUMMARY:Water the plants');
    expect(feed.body).toContain(`?note=${note.id}`);
    expect(feed.body).toContain('END:VCALENDAR');
  });

  it('expands recurrence into individual UTC events instead of an RRULE', async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await noteWithReminder('Daily standup', { remindAt: start, rrule: 'FREQ=DAILY;COUNT=5' });

    const url = await tokenUrl();
    if (!url) throw new Error('no feed');
    const feed = await t.app.inject({ method: 'GET', url: new URL(url).pathname });

    // Five occurrences, five VEVENTs, no RRULE line: the expansion is ours so
    // wall-clock time survives DST without shipping a VTIMEZONE.
    const events = feed.body.split('BEGIN:VEVENT').length - 1;
    expect(events).toBeGreaterThanOrEqual(6); // 5 daily + the earlier one-shot
    expect(feed.body).not.toContain('RRULE:');
    expect(feed.body.match(/SUMMARY:Daily standup/g)).toHaveLength(5);
  });

  it('rotating the token breaks the old URL', async () => {
    const before = await tokenUrl();
    if (!before) throw new Error('no feed');
    const rotated = await t.app.inject({
      method: 'POST',
      url: '/api/calendar/token',
      headers: { cookie },
    });
    const after = (rotated.json() as { url: string }).url;
    expect(after).not.toBe(before);

    const old = await t.app.inject({ method: 'GET', url: new URL(before).pathname });
    expect(old.statusCode).toBe(404);
    const fresh = await t.app.inject({ method: 'GET', url: new URL(after).pathname });
    expect(fresh.statusCode).toBe(200);
  });

  it('revoking leaves nothing to subscribe to', async () => {
    const url = await tokenUrl();
    if (!url) throw new Error('no feed');
    const del = await t.app.inject({
      method: 'DELETE',
      url: '/api/calendar/token',
      headers: { cookie },
    });
    expect(del.statusCode).toBe(204);
    expect(await tokenUrl()).toBeNull();
    const gone = await t.app.inject({ method: 'GET', url: new URL(url).pathname });
    expect(gone.statusCode).toBe(404);
  });

  it('rejects a malformed token the same way as an unknown one', async () => {
    const bad = await t.app.inject({ method: 'GET', url: '/api/calendar/not a token.ics' });
    expect(bad.statusCode).toBeGreaterThanOrEqual(400);
    const unknown = await t.app.inject({
      method: 'GET',
      url: '/api/calendar/AAAAAAAAAAAAAAAAAAAAAAAA.ics',
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('needs a session to manage the token', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/calendar/token' });
    expect(res.statusCode).toBe(401);
  });
});
