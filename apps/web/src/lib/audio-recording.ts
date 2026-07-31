/**
 * What `MediaRecorder` should record into, and what to call the result.
 *
 * Every engine records into its own container — Opus in WebM (Chrome), Opus in
 * Ogg (Firefox), AAC in MP4 (Safari) — and none of them accepts the others'.
 * So the format is negotiated rather than chosen: the first candidate the
 * browser admits wins, and an engine that admits none gets its own default
 * (the empty string), which the server sniffs like any other upload.
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
];

export function pickRecordingMime(isTypeSupported: (type: string) => boolean): string {
  return MIME_CANDIDATES.find((type) => isTypeSupported(type)) ?? '';
}

/**
 * Below this, Stop produced no recording at all: the container's track
 * declaration is written once audio actually starts flowing (measured at
 * ~110 bytes of bare header under 100 ms in Chrome, a described track from
 * ~200 ms), so a stray tap yields a file with nothing in it. The server
 * refuses those on principle — it cannot tell them from a stripped container —
 * so the take is dropped here, where it can be explained.
 */
export const MIN_RECORDING_MS = 400;

/**
 * File name for the upload. The server ignores it (magic bytes decide the
 * type), but it is what a download of the attachment is called, so the
 * extension should not lie about the bytes.
 */
export function recordingFileName(mime: string): string {
  const base = mime.split(';')[0] ?? '';
  const ext =
    base === 'audio/ogg'
      ? 'ogg'
      : base === 'audio/mp4'
        ? 'm4a'
        : base === 'audio/wav'
          ? 'wav'
          : 'webm';
  return `recording.${ext}`;
}

/** Elapsed time as m:ss — a recording is minutes long, never hours. */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
