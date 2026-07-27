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

export function formatCreatedTooltip(iso: string, lang: string): string {
  const date = new Date(iso);
  const locale = localeFor(lang);
  const label = lang.startsWith('pt') ? 'Criada em' : 'Created';
  return `${label} ${format(date, 'PPp', { locale })}`;
}
