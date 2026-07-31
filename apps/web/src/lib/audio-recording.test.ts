import { describe, expect, it } from 'vitest';
import { formatElapsed, pickRecordingMime, recordingFileName } from './audio-recording.js';

/** `MediaRecorder.isTypeSupported` for an engine that admits only these. */
const supports =
  (...types: string[]) =>
  (type: string) =>
    types.includes(type);

describe('pickRecordingMime', () => {
  it('takes Opus in WebM where it is offered (Chrome)', () => {
    expect(pickRecordingMime(supports('audio/webm;codecs=opus', 'audio/webm'))).toBe(
      'audio/webm;codecs=opus',
    );
  });

  it('falls to Ogg, then to MP4, following what the engine admits', () => {
    expect(pickRecordingMime(supports('audio/ogg;codecs=opus', 'audio/ogg'))).toBe(
      'audio/ogg;codecs=opus',
    );
    expect(pickRecordingMime(supports('audio/mp4'))).toBe('audio/mp4');
  });

  it('asks for nothing when the engine admits nothing — its default recording still uploads', () => {
    expect(pickRecordingMime(() => false)).toBe('');
  });
});

describe('recordingFileName', () => {
  it.each([
    ['audio/webm;codecs=opus', 'recording.webm'],
    ['audio/ogg;codecs=opus', 'recording.ogg'],
    ['audio/mp4', 'recording.m4a'],
    ['audio/wav', 'recording.wav'],
  ])('names %s as %s', (mime, expected) => {
    expect(recordingFileName(mime)).toBe(expected);
  });

  it('assumes WebM for an unknown type rather than shipping no extension', () => {
    expect(recordingFileName('')).toBe('recording.webm');
  });
});

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [61, '1:01'],
    [600, '10:00'],
  ])('shows %d seconds as %s', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected);
  });
});
