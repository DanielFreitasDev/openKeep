import { Popover } from '@base-ui/react/popover';
import notificationsSvg from '@material-symbols/svg-500/outlined/notifications.svg?raw';
import updateSvg from '@material-symbols/svg-500/outlined/update.svg?raw';
import type { FullNote } from '@openkeep/shared';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatReminderTime } from '../../lib/dates.js';
import { Icon } from '../Icon.js';
import { NoteReminderPicker } from './ReminderPicker.js';

/** What the chip renders — a draft (composer) reminder has no note yet. */
export interface ReminderChipValue {
  remindAt: string;
  rrule?: string | null;
  snoozedUntil?: string | null;
  done?: boolean;
}

/** Keep's reminder chip: time + bell, struck when done; click edits. */
export function ReminderChip({
  reminder,
  picker,
}: {
  reminder: ReminderChipValue | null;
  picker: (close: () => void) => ReactNode;
}) {
  const { t, i18n } = useTranslation('reminders');
  const [open, setOpen] = useState(false);
  if (!reminder) return null;
  const effective = reminder.snoozedUntil ?? reminder.remindAt;

  return (
    <div className="px-3 pb-1.5">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={t('editReminder')}
          title={t('editReminder')}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-(--surface-hover) px-2.5 font-medium text-[0.6875rem] ${
            reminder.done ? 'text-on-surface-variant line-through' : 'text-on-surface-variant'
          } hover:shadow-(--elevation-2)`}
        >
          <Icon svg={reminder.rrule ? updateSvg : notificationsSvg} size={13} />
          <span className="truncate">{formatReminderTime(effective, i18n.language)}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="z-50" sideOffset={4}>
            <Popover.Popup className="rounded-lg border border-(--outline-variant) bg-surface shadow-(--elevation-3)">
              {picker(() => setOpen(false))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

/** The chip for a persisted note. */
export function NoteReminderChip({ note }: { note: FullNote }) {
  return (
    <ReminderChip
      reminder={note.reminder}
      picker={(close) => <NoteReminderPicker note={note} onDone={close} />}
    />
  );
}
