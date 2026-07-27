import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requestPushPermission } from '../../hooks/use-push.js';
import { useReminderMutations } from '../../hooks/use-reminder-mutations.js';
import { formatReminderTime } from '../../lib/dates.js';
import { settingsQuery } from '../../lib/queries.js';

const RECURRENCES: { value: string; key: string }[] = [
  { value: '', key: 'recurNone' },
  { value: 'FREQ=DAILY', key: 'recurDaily' },
  { value: 'FREQ=WEEKLY', key: 'recurWeekly' },
  { value: 'FREQ=MONTHLY', key: 'recurMonthly' },
  { value: 'FREQ=YEARLY', key: 'recurYearly' },
];

function at(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h ?? 8, m ?? 0, 0, 0);
  return d;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Keep's reminder menu: presets from settings + pick date & time + recurrence. */
export function ReminderPicker({ note, onDone }: { note: FullNote; onDone: () => void }) {
  const { t, i18n } = useTranslation('reminders');
  const { data: settings } = useQuery(settingsQuery);
  const m = useReminderMutations();
  const [custom, setCustom] = useState(false);
  const [when, setWhen] = useState(() => toLocalInputValue(new Date(Date.now() + 3600_000)));
  const [rrule, setRrule] = useState(note.reminder?.rrule ?? '');

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const morning = settings?.reminderMorning ?? '08:00';
  const evening = settings?.reminderEvening ?? '18:00';

  const laterToday = at(now, evening);
  const tomorrow = at(new Date(now.getTime() + 86400_000), morning);
  const nextWeek = at(new Date(now.getTime() + 7 * 86400_000), morning);

  const apply = (date: Date, rule = '') => {
    void requestPushPermission();
    m.set.mutate({
      noteId: note.id,
      body: {
        remindAt: date.toISOString(),
        rrule: rule || null,
        timezone,
      },
    });
    onDone();
  };

  const presetRow = (label: string, date: Date, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full items-center justify-between px-4 py-2 text-on-surface text-sm hover:bg-(--surface-hover) disabled:opacity-40"
      onClick={() => apply(date)}
    >
      {label}
      <span className="text-on-surface-variant text-xs">
        {formatReminderTime(date.toISOString(), i18n.language)}
      </span>
    </button>
  );

  return (
    <div className="w-72 py-2">
      <div className="px-4 pb-2 font-medium text-on-surface text-sm">{t('title')}</div>
      {!custom ? (
        <>
          {presetRow(t('laterToday'), laterToday, laterToday <= now)}
          {presetRow(t('tomorrow'), tomorrow)}
          {presetRow(t('nextWeek'), nextWeek)}
          <button
            type="button"
            className="flex w-full items-center px-4 py-2 text-on-surface text-sm hover:bg-(--surface-hover)"
            onClick={() => setCustom(true)}
          >
            {t('pickDateTime')}
          </button>
          {note.reminder && (
            <button
              type="button"
              className="flex w-full items-center border-(--outline-variant) border-t px-4 py-2 text-red-600 text-sm hover:bg-(--surface-hover) dark:text-red-400"
              onClick={() => {
                m.remove.mutate(note.id);
                onDone();
              }}
            >
              {t('deleteReminder')}
            </button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-2">
          <label className="flex flex-col gap-1 text-on-surface-variant text-xs">
            {t('dateTime')}
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="rounded border border-(--outline) bg-transparent px-2 py-1.5 text-on-surface text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-on-surface-variant text-xs">
            {t('repeat')}
            <select
              value={rrule}
              onChange={(e) => setRrule(e.target.value)}
              className="rounded border border-(--outline) bg-surface px-2 py-1.5 text-on-surface text-sm"
            >
              {RECURRENCES.map((r) => (
                <option key={r.key} value={r.value}>
                  {t(r.key)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded px-3 py-1.5 text-on-surface-variant text-sm hover:bg-(--surface-hover)"
              onClick={() => setCustom(false)}
            >
              {t('common:cancel')}
            </button>
            <button
              type="button"
              className="rounded px-3 py-1.5 font-medium text-primary text-sm hover:bg-(--surface-hover)"
              onClick={() => {
                const date = new Date(when);
                if (!Number.isNaN(date.getTime())) apply(date, rrule);
              }}
            >
              {t('common:save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
