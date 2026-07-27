import type { Attachment } from '@openkeep/shared';
import { LIMITS } from '@openkeep/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import sharp, { type FormatEnum, type Metadata } from 'sharp';
import type { Db } from '../../db/client.js';
import { attachments } from '../../db/schema/attachments.js';
import { noteMembers, notes } from '../../db/schema/notes.js';
import { AppError, errors } from '../../lib/errors.js';
import type { Storage } from '../../lib/storage.js';
import { assertNoteAccess, assertNotTrashed } from '../notes/access.js';

type AttachmentRow = typeof attachments.$inferSelect;

export function toAttachmentDto(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    kind: row.kind as Attachment['kind'],
    mime: row.mime,
    width: row.width,
    height: row.height,
    hasThumb: row.thumbKey !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

const MAGIC: { mime: string; ext: string; match: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    match: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'image/gif', ext: 'gif', match: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    mime: 'image/webp',
    ext: 'webp',
    match: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/**
 * Upload pipeline: magic bytes decide the type (declared mime ignored, no
 * SVG), sharp re-encode strips EXIF and doubles as an integrity check.
 */
export async function uploadImage(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
): Promise<Attachment> {
  const { note } = await assertNoteAccess(db, userId, noteId);
  assertNotTrashed(note);

  if (data.length > LIMITS.imageMaxBytes) {
    throw errors.payloadTooLarge(`Images can be at most ${LIMITS.imageMaxBytes / 1024 / 1024} MB`);
  }
  const magic = MAGIC.find((m) => m.match(data));
  if (!magic) {
    throw errors.unsupportedMediaType('Only JPEG, PNG, GIF and WebP images are supported');
  }

  const [row] = await db
    .select({ n: count() })
    .from(attachments)
    .where(eq(attachments.noteId, noteId));
  if ((row?.n ?? 0) >= LIMITS.attachmentsPerNoteMax) {
    throw new AppError(400, 'attachment_limit_reached', 'Attachment limit reached');
  }

  let meta: Metadata;
  try {
    meta = await sharp(data, { animated: magic.mime === 'image/gif' }).metadata();
  } catch {
    throw errors.unsupportedMediaType('Corrupt or unsupported image');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width * height > LIMITS.imageMaxPixels) {
    throw errors.payloadTooLarge('Image exceeds 25 megapixels');
  }

  // Re-encode (EXIF stripped, auto-rotated); GIFs keep animation as-is.
  let stored = data;
  if (magic.mime !== 'image/gif') {
    stored = await sharp(data)
      .rotate()
      .toFormat(magic.ext as keyof FormatEnum)
      .toBuffer();
  }
  const thumb = await sharp(data, { animated: false })
    .rotate()
    .resize({ width: 512, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const storageKey = storage.newKey(magic.ext);
  const thumbKey = storage.newKey('webp');
  await storage.write('attachments', storageKey, stored);
  await storage.write('thumbs', thumbKey, thumb);

  const [created] = await db
    .insert(attachments)
    .values({
      noteId,
      kind: 'image',
      storageKey,
      thumbKey,
      mime: magic.mime,
      size: stored.length,
      width,
      height,
    })
    .returning();
  await db.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, noteId));
  return toAttachmentDto(created!);
}

export interface AttachmentFile {
  stream: NodeJS.ReadableStream;
  mime: string;
}

async function findForUser(db: Db, userId: string, attachmentId: string): Promise<AttachmentRow> {
  const [row] = await db
    .select({ att: attachments })
    .from(attachments)
    .innerJoin(noteMembers, eq(noteMembers.noteId, attachments.noteId))
    .where(and(eq(attachments.id, attachmentId), eq(noteMembers.userId, userId)))
    .limit(1);
  if (!row) throw errors.notFound();
  return row.att;
}

export async function openAttachment(
  db: Db,
  storage: Storage,
  userId: string,
  attachmentId: string,
  variant: 'file' | 'thumb',
): Promise<AttachmentFile> {
  const att = await findForUser(db, userId, attachmentId);
  const key = variant === 'thumb' ? att.thumbKey : att.storageKey;
  if (!key || !(await storage.exists(variant === 'thumb' ? 'thumbs' : 'attachments', key))) {
    throw errors.notFound();
  }
  return {
    stream: storage.createReadStream(variant === 'thumb' ? 'thumbs' : 'attachments', key),
    mime: variant === 'thumb' ? 'image/webp' : att.mime,
  };
}

export async function noteIdOfAttachment(
  db: Db,
  userId: string,
  attachmentId: string,
): Promise<string | null> {
  try {
    const att = await findForUser(db, userId, attachmentId);
    return att.noteId;
  } catch {
    return null;
  }
}

export async function deleteAttachment(
  db: Db,
  storage: Storage,
  userId: string,
  attachmentId: string,
): Promise<void> {
  const att = await findForUser(db, userId, attachmentId);
  const { note } = await assertNoteAccess(db, userId, att.noteId);
  assertNotTrashed(note);
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await storage.remove('attachments', att.storageKey);
  if (att.thumbKey) await storage.remove('thumbs', att.thumbKey);
}

/** Storage keys for a set of notes (collected BEFORE hard deletes). */
export async function attachmentKeysForNotes(
  db: Db,
  noteIds: string[],
): Promise<{ storageKey: string; thumbKey: string | null }[]> {
  if (noteIds.length === 0) return [];
  return db
    .select({ storageKey: attachments.storageKey, thumbKey: attachments.thumbKey })
    .from(attachments)
    .where(inArray(attachments.noteId, noteIds));
}

export async function unlinkAttachmentFiles(
  storage: Storage,
  keys: { storageKey: string; thumbKey: string | null }[],
): Promise<void> {
  for (const k of keys) {
    await storage.remove('attachments', k.storageKey);
    if (k.thumbKey) await storage.remove('thumbs', k.thumbKey);
  }
}

/** Copy attachment rows + files from one note to another (Make a copy). */
export async function copyAttachments(
  db: Db,
  storage: Storage,
  fromNoteId: string,
  toNoteId: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.noteId, fromNoteId))
    .orderBy(asc(attachments.createdAt));
  for (const row of rows) {
    const newKey = storage.newKey(row.storageKey.split('.').pop() ?? 'bin');
    const buf = await readAll(storage.createReadStream('attachments', row.storageKey)).catch(
      () => null,
    );
    if (!buf) continue;
    await storage.write('attachments', newKey, buf);
    let newThumb: string | null = null;
    if (row.thumbKey) {
      const tb = await readAll(storage.createReadStream('thumbs', row.thumbKey)).catch(() => null);
      if (tb) {
        newThumb = storage.newKey('webp');
        await storage.write('thumbs', newThumb, tb);
      }
    }
    await db.insert(attachments).values({
      noteId: toNoteId,
      kind: row.kind,
      storageKey: newKey,
      thumbKey: newThumb,
      mime: row.mime,
      size: row.size,
      width: row.width,
      height: row.height,
    });
  }
}

function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(c as Buffer));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
