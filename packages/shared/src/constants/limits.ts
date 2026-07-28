/** Content and account limits (Keep parity where known, sane caps elsewhere). */
export const LIMITS = {
  /** Keep rejects titles beyond ~999 chars. */
  noteTitleMax: 999,
  /** Keep's documented body ceiling: 19,999 characters (plain text). */
  noteBodyTextMax: 19_999,
  /** Backstop for the sanitized HTML representation of the body. */
  noteBodyHtmlMax: 100_000,
  /** Checklist item text cap. */
  itemTextMax: 1_000,
  /** ~1,000 checklist items per note (Keep parity). */
  itemsPerNoteMax: 1_000,
  /** 50 labels per account (Keep parity). */
  labelsPerUserMax: 50,
  labelNameMax: 255,
  attachmentsPerNoteMax: 25,
  collaboratorsPerNoteMax: 20,
  /** Upload caps: ~10 MB and 25 megapixels per image. */
  imageMaxBytes: 10 * 1024 * 1024,
  imageMaxPixels: 25_000_000,
  /** Audio attachments (Takeout import only in v1). */
  audioMaxBytes: 20 * 1024 * 1024,
  /** Takeout archives carry full-size photos — far beyond the image cap. */
  importZipMaxBytes: 512 * 1024 * 1024,
  /** Trash retention before permanent purge, in days (Keep parity). */
  trashRetentionDays: 7,
  /** Version snapshots kept per note (oldest pruned). */
  versionsPerNoteMax: 50,
  /** Undo snackbar visibility, in ms. */
  undoWindowMs: 8_000,
} as const;
