import { describe, expect, it } from 'vitest';
import { resolveLabels } from '../render.js';
import { getAttachment, uploadAudio, uploadFile, uploadImage } from './attachments.js';
import { getCalendarFeed, revokeCalendarFeed, rotateCalendarFeed } from './calendar.js';
import { addChecklistItems } from './checklist.js';
import { addCollaborator, listCollaborators, setCollaboratorRole } from './collaborators.js';
import { createDrawing, getDrawing, updateDrawing } from './drawings.js';
import { FakeOpenKeepClient } from './fake-client.js';
import { importMarkdown } from './import-export.js';
import { addLabelToNote, removeLabelFromNote, renameLabel } from './labels.js';
import {
  createNote,
  deleteAllNotes,
  getNote,
  listNotes,
  mergeNotes,
  setNoteState,
  updateNote,
} from './notes.js';
import { setReminder } from './reminders.js';
import { getStorageUsage } from './settings.js';
import { createShareLink, getShareLink, revokeShareLink } from './share-links.js';
import { AudioOutput, FileOutput, ImageOutput } from './types.js';

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

  it('round-trips a GFM table, which the docs promise and the sanitizer keeps', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const table = '| item | qtd |\n| --- | --- |\n| café | 2 |';

    await updateNote.handler(client, { note_id: note.id, markdown: table }, caps);
    expect(client.notes.get(note.id)?.bodyHtml).toBe(
      '<table><tbody><tr><th>item</th><th>qtd</th></tr>' +
        '<tr><td>café</td><td>2</td></tr></tbody></table>',
    );

    // What comes out is what went in, so read → edit → write keeps the table.
    const read = (await getNote.handler(client, { note_id: note.id }, caps)) as {
      markdown?: string;
    };
    expect(read.markdown).toBe(table);
  });
});

describe('templates', () => {
  /**
   * The tool surface is snake_case and the API is camelCase, so this crossing
   * is the one place the flag can be silently dropped: a patch that carried
   * `is_template` through untranslated would be accepted and ignored.
   */
  it('moves a note onto the shelf and out of the active listing', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({ title: 'Weekly review' });

    expect(
      ((await listNotes.handler(client, {}, caps)) as { notes: { id: string }[] }).notes.map(
        (n) => n.id,
      ),
    ).toContain(note.id);

    await setNoteState.handler(client, { note_id: note.id, is_template: true }, caps);
    expect(client.notes.get(note.id)?.isTemplate).toBe(true);

    const active = (await listNotes.handler(client, {}, caps)) as { notes: { id: string }[] };
    expect(active.notes.map((n) => n.id)).not.toContain(note.id);
    const shelf = (await listNotes.handler(client, { view: 'templates' }, caps)) as {
      notes: { id: string }[];
    };
    expect(shelf.notes.map((n) => n.id)).toEqual([note.id]);
  });

  it('still refuses an empty patch', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await expect(setNoteState.handler(client, { note_id: note.id }, caps)).rejects.toThrow(
      /Nothing to change/,
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
    // The default variant is the thumbnail, and a thumbnail is always webp.
    expect((output as ImageOutput).mimeType).toBe('image/webp');

    const original = await getAttachment.handler(
      client,
      { attachment_id: uploaded.id, variant: 'file' },
      caps,
    );
    expect((original as ImageOutput).mimeType).toBe('image/png');
  });

  it('rejects path uploads without localFs', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await expect(
      uploadImage.handler(client, { note_id: note.id, path: '/tmp/x.png' }, { localFs: false }),
    ).rejects.toThrow('stdio');
  });

  it('falls back to the original when an attachment has no thumbnail', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const uploaded = (await uploadAudio.handler(
      client,
      { note_id: note.id, data_base64: Buffer.from([9, 9]).toString('base64') },
      caps,
    )) as { id: string };

    // No variant given: `thumb` 404s for audio, so the tool retries with the
    // original rather than surfacing a not_found the caller cannot act on.
    const output = await getAttachment.handler(client, { attachment_id: uploaded.id }, caps);
    expect(output).toBeInstanceOf(AudioOutput);
    expect((output as AudioOutput).mimeType).toBe('audio/webm');
    expect((output as AudioOutput).meta?.variant).toBe('file');
  });

  it('does not second-guess an explicitly requested variant', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const uploaded = (await uploadFile.handler(
      client,
      { note_id: note.id, filename: 'report.pdf', data_base64: 'AAAA' },
      caps,
    )) as { id: string };

    await expect(
      getAttachment.handler(client, { attachment_id: uploaded.id, variant: 'thumb' }, caps),
    ).rejects.toThrow();
  });

  it('hands a non-image, non-audio file back as an embedded resource', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const bytes = Buffer.from('%PDF-1.7');
    const uploaded = (await uploadFile.handler(
      client,
      { note_id: note.id, filename: 'report.pdf', data_base64: bytes.toString('base64') },
      caps,
    )) as { id: string; filename: string | null };
    expect(uploaded.filename).toBe('report.pdf');

    const output = await getAttachment.handler(client, { attachment_id: uploaded.id }, caps);
    expect(output).toBeInstanceOf(FileOutput);
    expect((output as FileOutput).mimeType).toBe('application/pdf');
    expect((output as FileOutput).base64).toBe(bytes.toString('base64'));
  });

  it('needs a filename for a file upload, since the name is what downloads', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await expect(
      uploadFile.handler(client, { note_id: note.id, data_base64: 'AAAA' }, caps),
    ).rejects.toThrow('filename');
  });
});

describe('drawings', () => {
  const strokes = [{ tool: 'pen' as const, color: '#000000', size: 4, points: [10, 10, 60, 40] }];
  const drawing = {
    version: 1 as const,
    width: 200,
    height: 120,
    background: 'none' as const,
    strokes,
  };

  it('rasterizes the strokes when no render is supplied', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const created = (await createDrawing.handler(client, { note_id: note.id, drawing }, caps)) as {
      attachment_id: string;
    };

    // The stored bytes are a real PNG, produced from the vectors alone.
    const stored = client.attachmentData.get(created.attachment_id);
    expect(
      Buffer.from(stored?.data ?? [])
        .subarray(1, 4)
        .toString('latin1'),
    ).toBe('PNG');
    expect(client.drawings.get(created.attachment_id)?.strokes).toHaveLength(1);
  });

  it('round-trips vectors through get_drawing and update_drawing', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const created = (await createDrawing.handler(client, { note_id: note.id, drawing }, caps)) as {
      attachment_id: string;
    };

    const read = (await getDrawing.handler(
      client,
      { attachment_id: created.attachment_id },
      caps,
    )) as { strokes: unknown[]; stroke_count: number };
    expect(read.stroke_count).toBe(1);

    await updateDrawing.handler(
      client,
      {
        attachment_id: created.attachment_id,
        drawing: { ...drawing, strokes: [...strokes, ...strokes] },
      },
      caps,
    );
    expect(client.drawings.get(created.attachment_id)?.strokes).toHaveLength(2);
  });

  it('refuses to invent the backdrop of a drawing made over a photo', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    await expect(
      createDrawing.handler(
        client,
        {
          note_id: note.id,
          drawing: { ...drawing, photoAttachmentId: '0195b1f0-0000-7000-8000-000000000000' },
        },
        caps,
      ),
    ).rejects.toThrow('png_base64');
  });
});

describe('share link', () => {
  it('reports no link, then creates and revokes one', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});

    const before = (await getShareLink.handler(client, { note_id: note.id }, caps)) as {
      url: string | null;
    };
    expect(before.url).toBeNull();

    const created = (await createShareLink.handler(
      client,
      { note_id: note.id, expires_in_days: 7 },
      caps,
    )) as { url: string | null; expires_at: string | null };
    expect(created.url).toContain('/s/');
    expect(created.expires_at).not.toBeNull();

    await revokeShareLink.handler(client, { note_id: note.id }, caps);
    const after = (await getShareLink.handler(client, { note_id: note.id }, caps)) as {
      url: string | null;
    };
    expect(after.url).toBeNull();
  });

  it('omitting expires_in_days means the link lives until it is revoked', async () => {
    const client = new FakeOpenKeepClient();
    const note = client.seedNote({});
    const created = (await createShareLink.handler(client, { note_id: note.id }, caps)) as {
      expires_at: string | null;
    };
    expect(created.expires_at).toBeNull();
  });
});

describe('merge and empty', () => {
  it('merges into the first id and trashes the rest', async () => {
    const client = new FakeOpenKeepClient();
    const target = client.seedNote({ title: 'Target', bodyHtml: '<p>a</p>' });
    const source = client.seedNote({ title: 'Source', bodyHtml: '<p>b</p>' });

    const result = (await mergeNotes.handler(
      client,
      { note_ids: [target.id, source.id] },
      caps,
    )) as { merged_into: string; sources_trashed: number };

    expect(result.merged_into).toBe(target.id);
    expect(result.sources_trashed).toBe(1);
    expect(client.notes.get(source.id)?.trashedAt).not.toBeNull();
    expect(client.notes.get(target.id)?.trashedAt).toBeNull();
  });

  it('delete_all_notes reports what went and what stayed', async () => {
    const client = new FakeOpenKeepClient();
    client.seedNote({ title: 'Mine' });
    client.seedNote({ title: 'Theirs', role: 'collaborator' });
    await client.createLabel('work');

    const result = (await deleteAllNotes.handler(
      client,
      { confirm: 'delete-all-notes' },
      caps,
    )) as { deleted: number; left_shared_notes: number; labels_deleted: number };

    expect(result.deleted).toBe(1);
    expect(result.left_shared_notes).toBe(1);
    expect(result.labels_deleted).toBe(1);
  });
});

describe('storage and calendar', () => {
  it('reports the remaining allowance, and null when uncapped', async () => {
    const client = new FakeOpenKeepClient();
    client.storage = { usedBytes: 400, quotaBytes: 1000 };
    const capped = (await getStorageUsage.handler(client, {}, caps)) as {
      remaining_bytes: number | null;
    };
    expect(capped.remaining_bytes).toBe(600);

    client.storage = { usedBytes: 400, quotaBytes: null };
    const uncapped = (await getStorageUsage.handler(client, {}, caps)) as {
      remaining_bytes: number | null;
    };
    expect(uncapped.remaining_bytes).toBeNull();
  });

  it('mints and revokes the reminder feed', async () => {
    const client = new FakeOpenKeepClient();
    expect(
      ((await getCalendarFeed.handler(client, {}, caps)) as { url: string | null }).url,
    ).toBeNull();

    const minted = (await rotateCalendarFeed.handler(client, {}, caps)) as { url: string | null };
    expect(minted.url).toContain('.ics');

    await revokeCalendarFeed.handler(client, {}, caps);
    expect(
      ((await getCalendarFeed.handler(client, {}, caps)) as { url: string | null }).url,
    ).toBeNull();
  });
});

describe('markdown import', () => {
  it('sends inline files through and names the ones it left out', async () => {
    const client = new FakeOpenKeepClient();
    const result = (await importMarkdown.handler(
      client,
      {
        files: [
          { filename: 'a.md', text: '# Alpha\n\nbody' },
          { filename: 'notes.png', text: 'not markdown' },
        ],
      },
      caps,
    )) as { imported: number; ignored?: string[] };

    // The wrong extension never reaches the server — it would be dropped
    // there without being counted, so the tool reports it instead.
    expect(client.calls).toContain('importMarkdown:1');
    expect(result.imported).toBe(1);
    expect(result.ignored).toEqual(['notes.png']);
    expect([...client.notes.values()][0]?.title).toBe('Alpha');
  });

  it('refuses a batch where nothing is markdown at all', async () => {
    const client = new FakeOpenKeepClient();
    await expect(
      importMarkdown.handler(client, { files: [{ filename: 'a.png', text: 'x' }] }, caps),
    ).rejects.toThrow('nothing to import');
  });

  it('rejects local paths when the server is not on the user’s machine', async () => {
    const client = new FakeOpenKeepClient();
    await expect(
      importMarkdown.handler(client, { paths: ['/tmp/vault/a.md'] }, { localFs: false }),
    ).rejects.toThrow('stdio');
  });

  it('needs something to import', async () => {
    const client = new FakeOpenKeepClient();
    await expect(importMarkdown.handler(client, {}, caps)).rejects.toThrow('files');
  });
});
