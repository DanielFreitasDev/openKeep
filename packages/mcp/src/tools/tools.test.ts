import { describe, expect, it } from 'vitest';
import { resolveLabels } from '../render.js';
import { getAttachment, uploadImage } from './attachments.js';
import { addChecklistItems } from './checklist.js';
import { addCollaborator, listCollaborators, setCollaboratorRole } from './collaborators.js';
import { FakeOpenKeepClient } from './fake-client.js';
import { addLabelToNote, removeLabelFromNote, renameLabel } from './labels.js';
import { createNote, getNote, updateNote } from './notes.js';
import { setReminder } from './reminders.js';
import { ImageOutput } from './types.js';

const caps = { localFs: false };

describe('create_note (composite)', () => {
  it('creates content first, then labels, reminder and archive — in order', async () => {
    const client = new FakeOpenKeepClient();
    const result = (await createNote.handler(
      client,
      {
        title: 'Groceries',
        items: [{ text: 'Milk' }, { text: 'Bread', checked: true }],
        pinned: true,
        color: 'mint',
        labels: ['mercado'],
        reminder: { remind_at: '2026-07-30T18:00:00.000Z' },
        archived: true,
      },
      caps,
    )) as { note: { id: string; labels?: string[] }; warnings?: string[] };

    expect(result.warnings).toBeUndefined();
    expect(result.note.labels).toEqual(['mercado']);
    expect(client.calls[0]).toBe('createNote');
    expect(client.calls).toContain('createLabel:mercado');
    const labelIdx = client.calls.indexOf('addLabelToNote');
    const reminderIdx = client.calls.findIndex((c) => c.startsWith('setReminder'));
    const archiveIdx = client.calls.indexOf('patchNoteState');
    expect(labelIdx).toBeGreaterThan(0);
    expect(reminderIdx).toBeGreaterThan(labelIdx);
    expect(archiveIdx).toBeGreaterThan(reminderIdx);

    const note = [...client.notes.values()][0]!;
    expect(note.type).toBe('list');
    expect(note.items).toHaveLength(2);
    expect(note.pinned).toBe(true);
    expect(note.archived).toBe(true);
    expect(note.reminder?.timezone).toBe('UTC');
  });

  it('returns the created note plus warnings when a follow-up fails (no rollback)', async () => {
    const client = new FakeOpenKeepClient();
    client.setReminder = async () => {
      throw new Error('boom');
    };
    const result = (await createNote.handler(
      client,
      { title: 'Partial', reminder: { remind_at: '2026-07-30T18:00:00.000Z' } },
      caps,
    )) as { note: { id: string }; warnings?: string[] };

    expect(client.notes.has(result.note.id)).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain('set_reminder');
  });

  it('uses the account timezone for reminders when none is given', async () => {
    const client = new FakeOpenKeepClient();
    client.settings.timezone = 'America/Fortaleza';
    await createNote.handler(
      client,
      { title: 'TZ', reminder: { remind_at: '2026-07-30T18:00:00.000Z' } },
      caps,
    );
    expect(client.calls).toContain('setReminder:America/Fortaleza');
  });

  it('derives body html from plain text', async () => {
    const client = new FakeOpenKeepClient();
    const result = (await createNote.handler(client, { text: 'line one\nline <2>' }, caps)) as {
      note: { id: string };
    };
    expect(client.notes.get(result.note.id)?.bodyHtml).toBe('<p>line one</p><p>line &lt;2&gt;</p>');
  });
});

describe('update_note / get_note body surface', () => {
  it('renders markdown by default and html only when asked', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({ bodyHtml: '<h1>Big</h1><p>a<br>b</p>' });

    const plain = (await getNote.handler(client, { note_id: note.id }, caps)) as {
      markdown?: string;
      body_html?: string;
    };
    expect(plain.markdown).toBe('# Big\n\na  \nb');
    expect(plain.body_html).toBeUndefined();

    const withHtml = (await getNote.handler(
      client,
      { note_id: note.id, include_html: true },
      caps,
    )) as { body_html?: string };
    expect(withHtml.body_html).toBe('<h1>Big</h1><p>a<br>b</p>');
  });

  it('update_note takes markdown, converts text to paragraphs and rejects empty patches', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await updateNote.handler(client, { note_id: note.id, text: 'x\ny' }, caps);
    expect(client.notes.get(note.id)?.bodyHtml).toBe('<p>x</p><p>y</p>');

    await updateNote.handler(client, { note_id: note.id, markdown: '## T\n\n- a\n- b' }, caps);
    expect(client.notes.get(note.id)?.bodyHtml).toBe('<h2>T</h2><ul><li>a</li><li>b</li></ul>');

    await expect(updateNote.handler(client, { note_id: note.id }, caps)).rejects.toThrow(
      'Nothing to update',
    );
  });
});

describe('checklist batch', () => {
  it('creates items sequentially preserving order', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({ type: 'list' });
    const result = (await addChecklistItems.handler(
      client,
      { note_id: note.id, items: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
      caps,
    )) as { added: number };
    expect(result.added).toBe(3);
    expect(client.calls).toEqual(['createItem:a', 'createItem:b', 'createItem:c']);
    expect(client.notes.get(note.id)?.items.map((i) => i.text)).toEqual(['a', 'b', 'c']);
  });
});

describe('label resolution', () => {
  it('matches case-insensitively and creates only the missing ones', async () => {
    const client = new FakeOpenKeepClient();
    await client.createLabel('Mercado');
    client.calls = [];

    const { resolved } = await resolveLabels(client, ['mercado', 'Ideias'], {
      createMissing: true,
    });
    expect(resolved.map((l) => l.name)).toEqual(['Mercado', 'Ideias']);
    expect(client.calls).toEqual(['createLabel:Ideias']);
  });

  it('reports missing labels without creating when createMissing=false', async () => {
    const client = new FakeOpenKeepClient();
    const { resolved, missing } = await resolveLabels(client, ['nope'], { createMissing: false });
    expect(resolved).toEqual([]);
    expect(missing).toEqual(['nope']);
  });

  it('add_label_to_note attaches by name; remove detaches; rename needs an existing label', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await addLabelToNote.handler(client, { note_id: note.id, label: 'trabalho' }, caps);
    expect(client.notes.get(note.id)?.labelIds).toHaveLength(1);

    await removeLabelFromNote.handler(client, { note_id: note.id, label: 'Trabalho' }, caps);
    expect(client.notes.get(note.id)?.labelIds).toHaveLength(0);

    await expect(
      renameLabel.handler(client, { name: 'ghost', new_name: 'x' }, caps),
    ).rejects.toThrow('No label named "ghost"');
  });
});

describe('reminders', () => {
  it('set_reminder defaults timezone from settings', async () => {
    const client = new FakeOpenKeepClient();
    client.settings.timezone = 'Europe/Lisbon';
    const note = client.seedNote({});
    const reminder = (await setReminder.handler(
      client,
      { note_id: note.id, remind_at: '2026-08-01T09:00:00.000Z', rrule: 'FREQ=DAILY' },
      caps,
    )) as { timezone: string; rrule: string | null };
    expect(reminder.timezone).toBe('Europe/Lisbon');
    expect(reminder.rrule).toBe('FREQ=DAILY');
  });
});

describe('collaborators', () => {
  it('shares at view-only and flips the level by email afterwards', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});

    const added = (await addCollaborator.handler(
      client,
      { note_id: note.id, email: 'reader@example.com', role: 'viewer' },
      caps,
    )) as { added: { role: string } };
    expect(added.added.role).toBe('viewer');

    // The email is resolved through the member list, like remove_collaborator.
    const changed = (await setCollaboratorRole.handler(
      client,
      { note_id: note.id, email: 'READER@example.com', role: 'collaborator' },
      caps,
    )) as { role: string };
    expect(changed.role).toBe('collaborator');

    const listed = (await listCollaborators.handler(client, { note_id: note.id }, caps)) as {
      collaborators: { email: string; role: string }[];
    };
    expect(listed.collaborators.find((c) => c.email === 'reader@example.com')?.role).toBe(
      'collaborator',
    );
  });
});

describe('attachments', () => {
  it('upload accepts base64 and get_attachment returns image output', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const bytes = Buffer.from([1, 2, 3, 4]);
    const uploaded = (await uploadImage.handler(
      client,
      { note_id: note.id, data_base64: bytes.toString('base64') },
      caps,
    )) as { id: string };

    const output = await getAttachment.handler(client, { attachment_id: uploaded.id }, caps);
    expect(output).toBeInstanceOf(ImageOutput);
    expect((output as ImageOutput).base64).toBe(bytes.toString('base64'));
    expect((output as ImageOutput).mimeType).toBe('image/png');
  });

  it('rejects path uploads without localFs', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await expect(
      uploadImage.handler(client, { note_id: note.id, path: '/tmp/x.png' }, { localFs: false }),
    ).rejects.toThrow('stdio');
  });
});
