/**
 * The file-attachment allowlist — what a note can carry besides images, audio
 * and drawings (`kind='file'`).
 *
 * The rule the whole feature rests on: **the bytes prove the container, the
 * extension names which one inside it**. A PDF has its own signature, but a
 * `.docx` and a `.zip` are byte-for-byte the same kind of thing (a zip), as are
 * `.doc` and `.xls` (an OLE2 compound file), so a signature alone cannot say
 * which. The extension picks among the entries of the family the bytes landed
 * in, and an extension that is not in this table is refused — so the browser's
 * declared mime is still never trusted, exactly as with images and audio.
 *
 * `text` is the one family without a signature, because plain text has none;
 * there the check is on the content (valid UTF-8, no NUL or stray control
 * bytes — see `looksLikeText` on the server).
 *
 * It lives in shared because both ends read it: the server to decide what to
 * accept, the client to build the file picker's `accept` and to label a chip.
 */

export type FileFamily = 'pdf' | 'zip' | 'ole2' | 'text';

export interface FileType {
  /** Lowercase extension, without the dot — also the stored file's suffix. */
  ext: string;
  mime: string;
  family: FileFamily;
}

export const FILE_TYPES: readonly FileType[] = [
  { ext: 'pdf', mime: 'application/pdf', family: 'pdf' },

  // Zip and the formats that are a zip with a known layout inside.
  { ext: 'zip', mime: 'application/zip', family: 'zip' },
  {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    family: 'zip',
  },
  {
    ext: 'xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    family: 'zip',
  },
  {
    ext: 'pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    family: 'zip',
  },
  { ext: 'odt', mime: 'application/vnd.oasis.opendocument.text', family: 'zip' },
  { ext: 'ods', mime: 'application/vnd.oasis.opendocument.spreadsheet', family: 'zip' },
  { ext: 'odp', mime: 'application/vnd.oasis.opendocument.presentation', family: 'zip' },
  { ext: 'epub', mime: 'application/epub+zip', family: 'zip' },

  // The pre-2007 Office formats, which self-hosted archives are full of.
  { ext: 'doc', mime: 'application/msword', family: 'ole2' },
  { ext: 'xls', mime: 'application/vnd.ms-excel', family: 'ole2' },
  { ext: 'ppt', mime: 'application/vnd.ms-powerpoint', family: 'ole2' },

  { ext: 'txt', mime: 'text/plain', family: 'text' },
  { ext: 'md', mime: 'text/markdown', family: 'text' },
  { ext: 'csv', mime: 'text/csv', family: 'text' },
  { ext: 'json', mime: 'application/json', family: 'text' },
] as const;

/** The `accept` attribute for a file picker: extensions, in table order. */
export const FILE_ACCEPT = FILE_TYPES.map((t) => `.${t.ext}`).join(',');

/** Human list for an error message ("PDF, DOCX, …"), in table order. */
export const FILE_EXTENSIONS_LABEL = FILE_TYPES.map((t) => t.ext.toUpperCase()).join(', ');

/** The extension of a filename, lowercased and without the dot ('' if none). */
export function fileExtensionOf(filename: string): string {
  const base = filename.slice(filename.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/** The allowlist entry for a filename's extension, or null. */
export function fileTypeOf(filename: string): FileType | null {
  const ext = fileExtensionOf(filename);
  return FILE_TYPES.find((t) => t.ext === ext) ?? null;
}

/**
 * The display name of an uploaded file: never a path, never control
 * characters, never empty, and capped — it is shown in a chip and repeated in a
 * `Content-Disposition`, but it is never a storage key (those stay opaque
 * uuids), so this is about what a reader sees, not about path safety.
 */
export function sanitizeAttachmentFilename(raw: string, max = 200): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned === '') return 'file';
  if (cleaned.length <= max) return cleaned;
  // Truncate the stem, keep the extension: the suffix is what names the format.
  const ext = fileExtensionOf(cleaned);
  const suffix = ext ? `.${ext}` : '';
  return cleaned.slice(0, Math.max(1, max - suffix.length)) + suffix;
}
