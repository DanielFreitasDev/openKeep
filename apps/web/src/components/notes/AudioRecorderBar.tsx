import { LIMITS } from '@openkeep/shared';
import { useTranslation } from 'react-i18next';
import type { RecorderStatus } from '../../hooks/use-audio-recorder.js';
import { formatElapsed } from '../../lib/audio-recording.js';

interface AudioRecorderBarProps {
  status: Exclude<RecorderStatus, 'idle'>;
  seconds: number;
  onStop: () => void;
  onCancel: () => void;
}

/**
 * The recording bar, pinned above the note like the find bar. It is the whole
 * recorder UI: there is nothing to configure, so the bar is a state readout
 * (the mic is live, this is how long for) plus the two ways out.
 *
 * Escape cancels the recording rather than closing the note — while the bar is
 * up it is the innermost thing on screen, and it says so with a Discard button
 * next to the key's usual meaning.
 */
export function AudioRecorderBar({ status, seconds, onStop, onCancel }: AudioRecorderBarProps) {
  const { t } = useTranslation('editor');
  const starting = status === 'starting';
  const remaining = LIMITS.audioRecordingMaxSeconds - seconds;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a key trap over the bar, not a control — every action here is also a button
    <div
      className="flex flex-none items-center gap-2 border-(--outline-variant) border-b px-3 py-1.5"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
    >
      <span
        aria-hidden
        className={`h-2.5 w-2.5 flex-none rounded-full ${
          starting
            ? 'bg-on-surface-variant'
            : 'animate-pulse bg-red-600 motion-reduce:animate-none dark:bg-red-400'
        }`}
      />
      <span aria-live="polite" className="min-w-0 flex-1 truncate text-on-surface text-sm">
        {starting ? t('recordingStarting') : t('recording')}
      </span>
      <span
        className={`flex-none px-1 text-xs tabular-nums ${
          // The cap only becomes information once it is close enough to change
          // what the person does about it.
          remaining <= 30 ? 'text-red-600 dark:text-red-400' : 'text-on-surface-variant'
        }`}
      >
        {remaining <= 30
          ? t('recordingTimeLeft', { time: formatElapsed(Math.max(0, remaining)) })
          : formatElapsed(seconds)}
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="flex-none rounded px-3 py-1.5 font-medium text-on-surface text-sm hover:bg-(--surface-hover)"
      >
        {t('discardRecording')}
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={starting}
        className="flex-none rounded px-3 py-1.5 font-medium text-primary text-sm hover:bg-(--surface-hover) disabled:text-on-surface-variant"
      >
        {t('stopRecording')}
      </button>
    </div>
  );
}
