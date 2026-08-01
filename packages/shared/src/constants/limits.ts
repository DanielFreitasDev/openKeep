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
  /** Personal access tokens (MCP/API) per account. */
  apiTokensPerUserMax: 10,
  /** Saved searches per account — sidebar shortcuts, so a list that still reads. */
  savedSearchesPerUserMax: 20,
  savedSearchNameMax: 60,
  /** A search query string (free text plus operators). */
  searchQueryMax: 500,
  labelNameMax: 255,
  attachmentsPerNoteMax: 25,
  collaboratorsPerNoteMax: 20,
  /** Upload caps: ~10 MB and 25 megapixels per image. */
  imageMaxBytes: 10 * 1024 * 1024,
  imageMaxPixels: 25_000_000,
  /** Audio attachments (Takeout imports and browser recordings). */
  audioMaxBytes: 20 * 1024 * 1024,
  /**
   * A single browser recording stops itself here (10 min). Opus at the
   * recorder's bitrate reaches the byte cap only after hours, so the ceiling
   * that actually matters is a tab left recording by accident.
   */
  audioRecordingMaxSeconds: 600,
  /**
   * Any other file (PDF, office document, archive, text). Higher than an image
   * because a scanned PDF is routinely tens of megabytes, and the ceiling is
   * about a self-hosted disk rather than about what the pipeline can chew.
   */
  fileMaxBytes: 25 * 1024 * 1024,
  /** Displayed filename cap (chip label and Content-Disposition). */
  attachmentFilenameMax: 200,
  /** Takeout archives carry full-size photos — far beyond the image cap. */
  importZipMaxBytes: 512 * 1024 * 1024,
  /** Drawings: stroke/point caps keep the vector JSON bounded (~1 MB). */
  drawingStrokesMax: 2_000,
  drawingPointsPerStrokeMax: 10_000,
  drawingDataMaxBytes: 1024 * 1024,
  /** Default trash retention before permanent purge, in days (Keep parity; TRASH_RETENTION_DAYS overrides). */
  trashRetentionDays: 7,
  /** Version snapshots kept per note (oldest pruned). */
  versionsPerNoteMax: 50,
  /** Undo snackbar visibility, in ms. */
  undoWindowMs: 8_000,
} as const;
