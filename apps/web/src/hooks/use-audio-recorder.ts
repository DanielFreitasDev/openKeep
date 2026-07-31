import { LIMITS } from '@openkeep/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_RECORDING_MS, pickRecordingMime, recordingFileName } from '../lib/audio-recording.js';

export type RecorderStatus = 'idle' | 'starting' | 'recording';
export type RecorderError = 'denied' | 'failed' | 'tooShort';

/**
 * Both halves are required and neither is polyfillable: `getUserMedia` also
 * needs a secure context, so a self-hosted instance served over plain http on
 * a LAN lands here and simply never offers the button.
 */
export function audioRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Microphone → a `File` ready for the audio upload route.
 *
 * The recording is only handed over when it ends deliberately: `stop` keeps it,
 * `cancel` throws it away, and both run through the same `onstop`, so the
 * microphone is released down one path no matter which the user took. Closing
 * the note mid-recording counts as stopping — the audio was already spoken, and
 * the upload mutation outlives the editor that started it.
 */
export function useAudioRecorder(
  onRecorded: (file: File) => void,
  onError: (kind: RecorderError) => void,
) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const keepRef = useRef(true);

  // Held in refs so a re-render of the editor cannot leave the recorder
  // reporting into a stale closure — it outlives several of them.
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const aliveRef = useRef(true);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setStatus('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus('idle');
      const denied = err instanceof DOMException && /NotAllowed|Security/.test(err.name);
      onErrorRef.current(denied ? 'denied' : 'failed');
      return;
    }

    const release = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    // The permission dialog is the one wait long enough for the note to be
    // closed underneath it. Answering it after that must not open a recording
    // nothing on screen can stop — the microphone would simply stay on.
    if (!aliveRef.current) {
      release();
      return;
    }
    let recorder: MediaRecorder;
    try {
      const mimeType = pickRecordingMime((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      release();
      setStatus('idle');
      onErrorRef.current('failed');
      return;
    }

    const chunks: Blob[] = [];
    const startedAt = Date.now();
    keepRef.current = true;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      keepRef.current = false;
      onErrorRef.current('failed');
    };
    recorder.onstop = () => {
      // The mic indicator goes out here, not when the button was pressed:
      // until `onstop` the recorder is still draining into `chunks`.
      release();
      recorderRef.current = null;
      setStatus('idle');
      setSeconds(0);
      if (!keepRef.current || chunks.length === 0) return;
      // Stop tapped on the way up: there is no audio in those bytes, and an
      // upload that fails on arrival explains itself worse than this does.
      if (Date.now() - startedAt < MIN_RECORDING_MS) {
        onErrorRef.current('tooShort');
        return;
      }
      // What the browser actually recorded, which may be narrower than what
      // was asked for — it is also the type the blob has to be labelled with.
      const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
      const blob = new Blob(chunks, { type });
      onRecordedRef.current(new File([blob], recordingFileName(type), { type }));
    };

    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setStatus('recording');
  }, []);

  const finish = useCallback((keep: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    keepRef.current = keep;
    recorder.stop();
  }, []);

  const stop = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => finish(false), [finish]);

  // Elapsed time is read off the clock rather than counted in ticks, so a
  // throttled background tab reports the recording's real length — and the
  // self-imposed ceiling lands where the file cap says it should.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    if (status !== 'recording') return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSeconds(elapsed);
      if (elapsed >= LIMITS.audioRecordingMaxSeconds) stopRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [status]);

  // Unmount (the note was closed) keeps the take: see the note above.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      finishRef.current(true);
    };
  }, []);

  return { status, seconds, start, stop, cancel };
}
