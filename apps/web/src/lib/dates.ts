import { format, isSameYear, isToday, isYesterday } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';

function localeFor(lang: string) {
  return lang.startsWith('pt') ? ptBR : enUS;
}

/** Keep's "Edited" stamp: time when today, "Yesterday, HH:mm", else date. */
export function formatEdited(iso: string, lang: string): string {
  const date = new Date(iso);
  const locale = localeFor(lang);
  if (isToday(date)) return format(date, 'p', { locale });
  if (isYesterday(date))
    return `${lang.startsWith('pt') ? 'ontem' : 'yesterday'}, ${format(date, 'p', { locale })}`;
  if (isSameYear(date, new Date())) return format(date, 'd MMM', { locale });
  return format(date, 'd MMM yyyy', { locale });
}

/** Reminder chip stamp: "Jul 30, 18:00" (this year) or with year. */
export function formatReminderTime(iso: string, lang: string): string {
  const date = new Date(iso);
  const locale = localeFor(lang);
  if (isToday(date)) return format(date, 'p', { locale });
  if (isSameYear(date, new Date())) return format(date, 'd MMM, p', { locale });
  return format(date, 'd MMM yyyy, p', { locale });
}

/** Version history stamp: full date down to the second, so entries never tie. */
export function formatVersionStamp(iso: string, lang: string): string {
  const date = new Date(iso);
  return format(date, 'PPpp', { locale: localeFor(lang) });
}

/**
 * The day of a `before:`/`after:` chip. Parsed as local midnight (not UTC) so
 * the chip shows exactly the day that was typed, whatever the offset.
 */
export function formatSearchDay(day: string, lang: string): string {
  return format(new Date(`${day}T00:00:00`), 'PP', { locale: localeFor(lang) });
}

export function formatCreatedTooltip(iso: string, lang: string): string {
  const date = new Date(iso);
  const locale = localeFor(lang);
  const label = lang.startsWith('pt') ? 'Criada em' : 'Created';
  return `${label} ${format(date, 'PPp', { locale })}`;
}
