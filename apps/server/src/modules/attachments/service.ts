import type { Attachment, DrawingData, FileFamily } from '@openkeep/shared';
import {
  FILE_EXTENSIONS_LABEL,
  fileTypeOf,
  LIMITS,
  sanitizeAttachmentFilename,
} from '@openkeep/shared';
import { and, asc, count, eq, inArray, sum } from 'drizzle-orm';
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
    filename: row.filename,
    hasThumb: row.thumbKey !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The per-account storage ceiling, threaded from `config.storageQuotaBytes`.
 * Every function that writes attachment bytes takes it in its options object
 * rather than defaulting to "no cap": a new upload path must decide out loud,
 * and the compiler asks the question.
 */
export interface QuotaOpts {
  quotaBytes: number | null;
}

/**
 * Bytes of attachments on the notes an account OWNS, trash included — the same
 * sum the admin panel prints per account, so the ceiling and the reading of it
 * can never disagree.
 */
export async function usedStorageBytes(db: Db, ownerId: string): Promise<number> {
  const [row] = await db
    .select({ bytes: sum(attachments.size) })
    .from(attachments)
    .innerJoin(notes, eq(notes.id, attachments.noteId))
    .where(eq(notes.ownerId, ownerId));
  // `sum()` is a bigint: null over an empty set, a string otherwise.
  return row?.bytes == null ? 0 : Number(row.bytes);
}

/**
 * Refuse bytes that would put an account past its allowance (DECISIONS #33).
 *
 * Charged to the note's OWNER, not to whoever is uploading: attribution has to
 * match the accounting, and a shared note's files live on the owner's tab. The
 * trash counts too — a trashed note's files are still on the disk until the
 * purge takes them.
 */
export async function assertStorageQuota(
  db: Db,
  { quotaBytes }: QuotaOpts,
  ownerId: string,
  incomingBytes: number,
): Promise<void> {
  if (quotaBytes === null || incomingBytes <= 0) return;
  const used = await usedStorageBytes(db, ownerId);
  if (used + incomingBytes <= quotaBytes) return;
  const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
  throw errors.storageQuotaExceeded(
    `This account's storage is full: ${mb(used)} MB of ${mb(quotaBytes)} MB used. Delete attachments or empty the trash to free space.`,
  );
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

const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * WebM (EBML) is the container `MediaRecorder` writes in Chrome, so in-browser
 * recordings arrive as one — but the signature alone says nothing about what
 * is inside, and this pipeline must not become a video upload by accident.
 *
 * So the answer comes from the codec ids in the Tracks element, which every
 * writer puts near the head (a recording's is in the first few hundred bytes):
 * an audio codec must be declared, and a video one must not. The names are
 * matched in full rather than by their `A_`/`V_` prefix, because the window
 * also covers compressed frames, where two-byte needles turn up by chance.
 * Beyond the window we decline instead of guessing.
 */
const WEBM_HEAD_BYTES = 8192;
const WEBM_AUDIO_CODEC = /A_(OPUS|VORBIS|AAC|MPEG|PCM|FLAC|MS)/;
const WEBM_VIDEO_CODEC = /V_(VP8|VP9|AV1|MPEG|THEORA|UNCOMPRESSED|MS)/;

function isAudioWebm(data: Buffer): boolean {
  if (!data.subarray(0, 4).equals(EBML_MAGIC)) return false;
  const head = data.subarray(0, WEBM_HEAD_BYTES).toString('latin1');
  return WEBM_AUDIO_CODEC.test(head) && !WEBM_VIDEO_CODEC.test(head);
}

/**
 * Audio formats we accept: what Keep's Takeout can carry (voice recordings +
 * imported files) plus what the browser's own recorder produces — WebM/Opus in
 * Chrome, Ogg/Opus in Firefox, MP4/AAC in Safari.
 * Order matters: container signatures before the loose MPEG frame-sync match.
 */
const AUDIO_MAGIC: { mime: string; ext: string; match: (b: Buffer) => boolean }[] = [
  {
    mime: 'audio/mp4',
    ext: 'm4a',
    match: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      !b.subarray(8, 11).toString('latin1').startsWith('3g'),
  },
  {
    mime: 'audio/3gpp',
    ext: '3gp',
    match: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      b.subarray(8, 11).toString('latin1').startsWith('3g'),
  },
  { mime: 'audio/ogg', ext: 'ogg', match: (b) => b.subarray(0, 4).toString('latin1') === 'OggS' },
  { mime: 'audio/webm', ext: 'webm', match: isAudioWebm },
  {
    mime: 'audio/wav',
    ext: 'wav',
    match: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WAVE',
  },
  { mime: 'audio/amr', ext: 'amr', match: (b) => b.subarray(0, 5).toString('latin1') === '#!AMR' },
  { mime: 'audio/mpeg', ext: 'mp3', match: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' },
  {
    mime: 'audio/aac',
    ext: 'aac',
    match: (b) => b[0] === 0xff && (b[1]! & 0xf6) === 0xf0,
  },
  {
    mime: 'audio/mpeg',
    ext: 'mp3',
    match: (b) => b[0] === 0xff && (b[1]! & 0xe0) === 0xe0,
  },
];

export function sniffAudio(data: Buffer): { mime: string; ext: string } | null {
  if (data.length < 12) return null;
  const found = AUDIO_MAGIC.find((m) => m.match(data));
  return found ? { mime: found.mime, ext: found.ext } : null;
}

const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Container signatures, one per family (see FILE_TYPES in shared). */
const FILE_MAGIC: { family: FileFamily; match: (b: Buffer) => boolean }[] = [
  { family: 'pdf', match: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  {
    family: 'zip',
    // 'PK' + a local file header (03 04) or the end record of an empty one (05 06).
    match: (b) =>
      b.subarray(0, 2).toString('latin1') === 'PK' &&
      ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06)),
  },
  { family: 'ole2', match: (b) => b.subarray(0, 8).equals(OLE2_MAGIC) },
];

/**
 * Plain text has no signature, so the family is decided by the content: it must
 * decode as UTF-8 (round-tripping proves it) and carry no NUL or stray control
 * bytes. That refuses binaries renamed to `.txt` without pretending to guess a
 * charset — a legacy Latin-1 file is asked for as UTF-8 instead of stored as a
 * text attachment whose bytes lie about their encoding.
 */
export function looksLikeText(data: Buffer): boolean {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(data);
  if (decoded.includes('�')) return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to find them
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded);
}

/**
 * The type of an arbitrary file attachment: the bytes prove the container, the
 * extension names which member of that container's family it is (DECISIONS #31).
 * The browser's declared mime never takes part — a `.docx` whose bytes are not a
 * zip is refused, and so is a zip called `.exe`.
 */
export function sniffFile(data: Buffer, filename: string): { mime: string; ext: string } | null {
  const type = fileTypeOf(filename);
  if (!type) return null;
  if (type.family === 'text')
    return looksLikeText(data) ? { mime: type.mime, ext: type.ext } : null;
  if (data.length < 8) return null;
  const magic = FILE_MAGIC.find((m) => m.match(data));
  return magic?.family === type.family ? { mime: type.mime, ext: type.ext } : null;
}

/**
 * Any other file on a note (PDF, office document, archive, text). Stored byte
 * for byte with no thumbnail: nothing here is an image, so there is nothing to
 * re-encode or resize, and the only thing added is the name it came with.
 */
export async function uploadFile(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
  rawFilename: string,
  quota: QuotaOpts,
): Promise<Attachment> {
  const { note } = await assertNoteAccess(db, userId, noteId, 'editor');
  assertNotTrashed(note);

  if (data.length > LIMITS.fileMaxBytes) {
    throw errors.payloadTooLarge(`Files can be at most ${LIMITS.fileMaxBytes / 1024 / 1024} MB`);
  }
  await assertStorageQuota(db, quota, note.ownerId, data.length);
  const filename = sanitizeAttachmentFilename(rawFilename, LIMITS.attachmentFilenameMax);
  const magic = sniffFile(data, filename);
  if (!magic) {
    throw errors.unsupportedMediaType(
      `Unsupported file type — accepted: ${FILE_EXTENSIONS_LABEL}. Images and audio have their own upload.`,
    );
  }

  const [row] = await db
    .select({ n: count() })
    .from(attachments)
    .where(eq(attachments.noteId, noteId));
  if ((row?.n ?? 0) >= LIMITS.attachmentsPerNoteMax) {
    throw new AppError(400, 'attachment_limit_reached', 'Attachment limit reached');
  }

  const storageKey = storage.newKey(magic.ext);
  await storage.write('attachments', storageKey, data);

  const [created] = await db
    .insert(attachments)
    .values({
      noteId,
      kind: 'file',
      storageKey,
      mime: magic.mime,
      size: data.length,
      filename,
    })
    .returning();
  await db.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, noteId));
  return toAttachmentDto(created!);
}

/**
 * Upload pipeline: magic bytes decide the type (declared mime ignored, no
 * SVG), sharp re-encode strips EXIF and doubles as an integrity check.
 *
 * `failOn: 'none'` keeps that check at "must decode" rather than "must be
 * pristine": phone cameras, messaging apps and Google's own Takeout JPEGs are
 * routinely warning-level malformed (truncated scan, odd SOS params) yet
 * render fine everywhere. A genuinely unreadable buffer still throws.
 */
export async function uploadImage(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
  opts: QuotaOpts & { allowTrashed?: boolean; touchNote?: boolean },
): Promise<Attachment> {
  const { note } = await assertNoteAccess(db, userId, noteId, 'editor');
  if (!opts.allowTrashed) assertNotTrashed(note);

  if (data.length > LIMITS.imageMaxBytes) {
    throw errors.payloadTooLarge(`Images can be at most ${LIMITS.imageMaxBytes / 1024 / 1024} MB`);
  }
  // Judged on the arriving bytes, before the re-encode: the last upload that
  // fits can land a few kilobytes either side of the ceiling, and refusing a
  // file only after spending sharp on it would be the worse trade.
  await assertStorageQuota(db, opts, note.ownerId, data.length);
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
    meta = await sharp(data, {
      animated: magic.mime === 'image/gif',
      failOn: 'none',
    }).metadata();
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
    stored = await sharp(data, { failOn: 'none' })
      .rotate()
      .toFormat(magic.ext as keyof FormatEnum)
      .toBuffer();
  }
  const thumb = await sharp(data, { animated: false, failOn: 'none' })
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
  // Skipped on import: `notes.updatedAt` has `$onUpdate`, so touching the row
  // here would stamp "now" over the Takeout `userEditedTimestampUsec`.
  if (opts.touchNote !== false) {
    await db.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, noteId));
  }
  return toAttachmentDto(created!);
}

/** Drawings arrive as canvas-rendered PNGs: verify, re-encode, thumbnail. */
async function processDrawingPng(
  data: Buffer,
): Promise<{ stored: Buffer; thumb: Buffer; width: number; height: number }> {
  if (data.length > LIMITS.imageMaxBytes) {
    throw errors.payloadTooLarge(`Images can be at most ${LIMITS.imageMaxBytes / 1024 / 1024} MB`);
  }
  const png = MAGIC.find((m) => m.mime === 'image/png');
  if (!png?.match(data)) {
    throw errors.unsupportedMediaType('Drawings must be PNG images');
  }
  let meta: Metadata;
  try {
    meta = await sharp(data, { failOn: 'none' }).metadata();
  } catch {
    throw errors.unsupportedMediaType('Corrupt or unsupported image');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width * height > LIMITS.imageMaxPixels) {
    throw errors.payloadTooLarge('Image exceeds 25 megapixels');
  }
  const stored = await sharp(data, { failOn: 'none' }).png().toBuffer();
  const thumb = await sharp(data, { failOn: 'none' })
    .resize({ width: 512, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  return { stored, thumb, width, height };
}

/** Create a drawing attachment: stroke vectors + their PNG render. */
export async function uploadDrawing(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
  drawing: DrawingData,
  quota: QuotaOpts,
): Promise<Attachment> {
  const { note } = await assertNoteAccess(db, userId, noteId, 'editor');
  assertNotTrashed(note);
  await assertStorageQuota(db, quota, note.ownerId, data.length);

  const [row] = await db
    .select({ n: count() })
    .from(attachments)
    .where(eq(attachments.noteId, noteId));
  if ((row?.n ?? 0) >= LIMITS.attachmentsPerNoteMax) {
    throw new AppError(400, 'attachment_limit_reached', 'Attachment limit reached');
  }

  const { stored, thumb, width, height } = await processDrawingPng(data);
  const storageKey = storage.newKey('png');
  const thumbKey = storage.newKey('webp');
  await storage.write('attachments', storageKey, stored);
  await storage.write('thumbs', thumbKey, thumb);

  const [created] = await db
    .insert(attachments)
    .values({
      noteId,
      kind: 'drawing',
      storageKey,
      thumbKey,
      mime: 'image/png',
      size: stored.length,
      width,
      height,
      drawingData: drawing,
    })
    .returning();
  await db.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, noteId));
  return toAttachmentDto(created!);
}

/** Replace a drawing's strokes + render in place (same attachment id). */
export async function updateDrawing(
  db: Db,
  storage: Storage,
  userId: string,
  attachmentId: string,
  data: Buffer,
  drawing: DrawingData,
  quota: QuotaOpts,
): Promise<{ attachment: Attachment; noteId: string }> {
  const att = await findForUser(db, userId, attachmentId);
  if (att.kind !== 'drawing') throw errors.notFound();
  const { note } = await assertNoteAccess(db, userId, att.noteId, 'editor');
  assertNotTrashed(note);
  // A replacement pays only for what it adds: the row it overwrites is already
  // in the sum, so re-saving a drawing that got simpler never trips the cap.
  await assertStorageQuota(db, quota, note.ownerId, data.length - att.size);

  const { stored, thumb, width, height } = await processDrawingPng(data);
  const storageKey = storage.newKey('png');
  const thumbKey = storage.newKey('webp');
  await storage.write('attachments', storageKey, stored);
  await storage.write('thumbs', thumbKey, thumb);

  const [updated] = await db
    .update(attachments)
    .set({
      storageKey,
      thumbKey,
      mime: 'image/png',
      size: stored.length,
      width,
      height,
      drawingData: drawing,
      updatedAt: new Date(),
    })
    .where(eq(attachments.id, attachmentId))
    .returning();
  // Old files go only after the row points at the new ones (readers never 404).
  await storage.remove('attachments', att.storageKey);
  if (att.thumbKey) await storage.remove('thumbs', att.thumbKey);
  await db.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, att.noteId));
  return { attachment: toAttachmentDto(updated!), noteId: att.noteId };
}

/** Stroke vectors for re-editing an existing drawing. */
export async function getDrawingData(
  db: Db,
  userId: string,
  attachmentId: string,
): Promise<DrawingData> {
  const att = await findForUser(db, userId, attachmentId);
  if (att.kind !== 'drawing' || att.drawingData == null) throw errors.notFound();
  return att.drawingData as DrawingData;
}

/**
 * Audio ingest, shared by the Takeout importer and the recorder. Magic bytes
 * decide the type; stored as-is, no thumbnail and no re-encode — an audio
 * attachment is a recording, not a photo, and transcoding it server-side would
 * cost a media stack to lose fidelity.
 */
async function ingestAudio(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
  opts: QuotaOpts & { ownerId: string; touchNote?: boolean },
): Promise<Attachment> {
  if (data.length > LIMITS.audioMaxBytes) {
    throw errors.payloadTooLarge(`Audio can be at most ${LIMITS.audioMaxBytes / 1024 / 1024} MB`);
  }
  await assertStorageQuota(db, opts, opts.ownerId, data.length);
  const magic = sniffAudio(data);
  if (!magic) throw errors.unsupportedMediaType('Unrecognized audio format');

  const [row] = await db
    .select({ n: count() })
    .from(attachments)
    .where(eq(attachments.noteId, noteId));
  if ((row?.n ?? 0) >= LIMITS.attachmentsPerNoteMax) {
    throw new AppError(400, 'attachment_limit_reached', 'Attachment limit reached');
  }

  const storageKey = storage.newKey(magic.ext);
  await storage.write('attachments', storageKey, data);

  const [created] = await db
    .insert(attachments)
    .values({
      noteId,
      kind: 'audio',
      storageKey,
      mime: magic.mime,
      size: data.length,
    })
    .returning();
  if (opts.touchNote !== false) {
    await db.update(notes).set({ lastEditedBy: userId }).where(eq(notes.id, noteId));
  }
  return toAttachmentDto(created!);
}

/**
 * Browser recording upload (`MediaRecorder` → this route). Same access rules
 * as an image: an editor of a note that is not in the trash.
 */
export async function uploadAudio(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
  quota: QuotaOpts,
): Promise<Attachment> {
  const { note } = await assertNoteAccess(db, userId, noteId, 'editor');
  assertNotTrashed(note);
  return ingestAudio(db, storage, userId, noteId, data, { ...quota, ownerId: note.ownerId });
}

/**
 * Import-time media dispatch: sniff the buffer (declared mime ignored, as
 * everywhere) and route to the image or audio pipeline. Runs with
 * `allowTrashed` — Takeout notes with `isTrashed` keep their media so a
 * restore brings them back intact. `touchNote: false` preserves the imported
 * edit timestamp (the note row was already stamped by the importer).
 */
export async function importMediaAttachment(
  db: Db,
  storage: Storage,
  userId: string,
  noteId: string,
  data: Buffer,
  quota: QuotaOpts,
): Promise<Attachment> {
  if (MAGIC.some((m) => m.match(data))) {
    return uploadImage(db, storage, userId, noteId, data, {
      ...quota,
      allowTrashed: true,
      touchNote: false,
    });
  }
  if (sniffAudio(data)) {
    const { note } = await assertNoteAccess(db, userId, noteId, 'editor');
    return ingestAudio(db, storage, userId, noteId, data, {
      ...quota,
      ownerId: note.ownerId,
      touchNote: false,
    });
  }
  throw errors.unsupportedMediaType('Unrecognized media format');
}

export interface AttachmentFile {
  stream: NodeJS.ReadableStream;
  mime: string;
  /**
   * The name a download should carry, set only for `kind='file'`. It doubles as
   * the signal to serve the bytes as an attachment rather than inline: images
   * and audio are meant to render in the page, whereas an arbitrary file has no
   * business being opened by the browser on our own origin.
   */
  download: string | null;
}

/**
 * `Content-Disposition` for a downloaded file: the ASCII fallback for old
 * clients plus the RFC 5987 form that carries the real name, since a note's
 * attachment is as likely to be called `orçamento.pdf` as anything else.
 */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
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

/**
 * The bytes of a row that the caller has already been cleared to read —
 * membership here, a public share token there. Authorization is the caller's
 * job precisely because there is more than one way to earn it.
 */
export async function streamAttachment(
  storage: Storage,
  att: AttachmentRow,
  variant: 'file' | 'thumb',
): Promise<AttachmentFile> {
  const key = variant === 'thumb' ? att.thumbKey : att.storageKey;
  if (!key || !(await storage.exists(variant === 'thumb' ? 'thumbs' : 'attachments', key))) {
    throw errors.notFound();
  }
  return {
    stream: storage.createReadStream(variant === 'thumb' ? 'thumbs' : 'attachments', key),
    mime: variant === 'thumb' ? 'image/webp' : att.mime,
    download: variant === 'file' && att.kind === 'file' ? (att.filename ?? 'file') : null,
  };
}

export async function openAttachment(
  db: Db,
  storage: Storage,
  userId: string,
  attachmentId: string,
  variant: 'file' | 'thumb',
): Promise<AttachmentFile> {
  return streamAttachment(storage, await findForUser(db, userId, attachmentId), variant);
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
  const { note } = await assertNoteAccess(db, userId, att.noteId, 'editor');
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

/**
 * Copy attachment rows + files from one note to another (Make a copy, merge).
 *
 * The quota applies here too: duplicated bytes are new bytes on the disk, and
 * a copy loop is otherwise the cheapest way around the ceiling. The owner is
 * read from the destination note — in a merge that runs source by source, so
 * each pass measures what the previous ones already added.
 */
export async function copyAttachments(
  db: Db,
  storage: Storage,
  fromNoteId: string,
  toNoteId: string,
  quota: QuotaOpts,
): Promise<void> {
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.noteId, fromNoteId))
    .orderBy(asc(attachments.createdAt));
  if (rows.length > 0 && quota.quotaBytes !== null) {
    const [target] = await db
      .select({ ownerId: notes.ownerId })
      .from(notes)
      .where(eq(notes.id, toNoteId));
    if (target) {
      const incoming = rows.reduce((n, r) => n + r.size, 0);
      await assertStorageQuota(db, quota, target.ownerId, incoming);
    }
  }
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
      // Copied drawings stay editable in the copy.
      drawingData: row.drawingData,
      // A file's name is its identity; the copy is not called something else.
      filename: row.filename,
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
