import brushSvg from '@material-symbols/svg-700/outlined/brush.svg?raw';
import checkboxSvg from '@material-symbols/svg-700/outlined/check_box.svg?raw';
import imageSvg from '@material-symbols/svg-700/outlined/image.svg?raw';
import linkSvg from '@material-symbols/svg-700/outlined/link.svg?raw';
import audioSvg from '@material-symbols/svg-700/outlined/mic.svg?raw';
import notificationsSvg from '@material-symbols/svg-700/outlined/notifications.svg?raw';
import searchSvg from '@material-symbols/svg-700/outlined/search.svg?raw';
import type { FullNote, SearchTerm } from '@openkeep/shared';
import { formatSearchTerms, NOTE_COLORS, parseSearchQuery, SEARCH_TYPES } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { EmptyView } from '../../components/EmptyView.js';
import { NotesGrid } from '../../components/grid/NotesGrid.js';
import { Icon } from '../../components/Icon.js';
import { usePublishViewOrder } from '../../hooks/use-app-keys.jsx';
import { formatSearchDay } from '../../lib/dates.js';
import { labelsQuery } from '../../lib/labels-api.js';
import type { SearchFilters } from '../../lib/note-selectors.js';
import { selectPeople, selectSearch } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { sessionQuery, settingsQuery } from '../../lib/queries.js';

const searchParams = z.object({
  /** Free text and operators, exactly as typed (see parseSearchQuery). */
  q: z.string().default(''),
  type: z.enum(SEARCH_TYPES).optional(),
  label: z.string().optional(),
  color: z.string().optional(),
  // A user id rather than an email: stable, and the chip resolves the name
  // from the corpus the tiles were built from.
  collaborator: z.string().optional(),
});

export const Route = createFileRoute('/_shell/search')({
  validateSearch: searchParams,
  component: SearchView,
});

/** `-is:pinned` reads as `is:unpinned`, so the chip says the opposite word. */
const IS_OPPOSITE: Record<string, string> = {
  pinned: 'unpinned',
  unpinned: 'pinned',
  archived: 'unarchived',
  unarchived: 'archived',
};

/** The query language, shown where the search screen is otherwise idle. */
const OPERATOR_HELP = [
  { syntax: 'label:name', key: 'op_label' },
  { syntax: 'color:blue', key: 'op_color' },
  { syntax: 'has:image', key: 'op_has' },
  { syntax: 'is:pinned', key: 'op_is' },
  { syntax: 'after:2026-01-01', key: 'op_date' },
  { syntax: '-word', key: 'op_minus' },
] as const;

function SearchView() {
  const { t, i18n } = useTranslation('search');
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: labels } = useQuery(labelsQuery);
  const { data: settings } = useQuery(settingsQuery);
  const { data: session } = useQuery(sessionQuery);
  const myId = session?.user.id;

  const labelId = params.label
    ? labels?.find((l) => l.name.toLowerCase() === params.label?.toLowerCase())?.id
    : undefined;

  const query = useMemo(() => parseSearchQuery(params.q), [params.q]);

  // The corpus holds label ids, so `label:` names are resolved here, where the
  // label list is. A name nobody carries stays as itself and matches nothing.
  const resolveLabels = useCallback(
    (names: string[]) =>
      names.map(
        (name) => labels?.find((l) => l.name.toLowerCase() === name.toLowerCase())?.id ?? name,
      ),
    [labels],
  );
  const labelIds = useMemo(() => resolveLabels(query.labels), [resolveLabels, query.labels]);
  const notLabelIds = useMemo(
    () => resolveLabels(query.notLabels),
    [resolveLabels, query.notLabels],
  );

  const hasAny =
    !query.isEmpty || params.type || params.label || params.color || params.collaborator;

  const noteSort = settings?.noteSort ?? 'manual';

  // Must be referentially stable, or react-query re-runs the whole search on
  // every render of this view rather than only when the filters change.
  const select = useCallback(
    (notes: FullNote[]) => {
      const filters: SearchFilters = {
        q: params.q,
        type: params.type,
        labelId,
        color: params.color,
        collaboratorId: params.collaborator,
        labelIds,
        notLabelIds,
      };
      return selectSearch(notes, filters, noteSort);
    },
    [
      params.q,
      params.type,
      labelId,
      params.color,
      params.collaborator,
      labelIds,
      notLabelIds,
      noteSort,
    ],
  );

  const { data: results } = useQuery({ ...notesQuery, select });

  const selectPeopleForMe = useCallback((notes: FullNote[]) => selectPeople(notes, myId), [myId]);
  const { data: people } = useQuery({ ...notesQuery, select: selectPeopleForMe });
  const activePerson = params.collaborator
    ? people?.find((p) => p.userId === params.collaborator)
    : undefined;

  const setParam = (patch: Partial<z.infer<typeof searchParams>>) =>
    void navigate({
      search: (old) => ({ ...old, ...patch }),
      replace: true,
    });

  // Operators live inside `q`, so their chips are removed by rewriting the
  // query without that token — the box and the chips are one state, never two.
  const operatorTerms = query.terms.filter((term) => term.kind !== 'text');
  const dropTerm = (term: SearchTerm) =>
    setParam({
      q: formatSearchTerms(query.terms.filter((t) => t.index !== term.index)) || undefined,
    });

  const operatorChipLabel = (term: SearchTerm): string => {
    const not = (label: string) => (term.negated ? t('chip_not', { term: label }) : label);
    switch (term.kind) {
      case 'label':
        return not(t('chip_label', { value: term.value }));
      case 'color':
        return not(t('chip_color', { value: t(`notes:color_${term.value}`) }));
      case 'has':
        return not(t('chip_has', { value: t(`type_${term.value}`) }));
      // A negated flag is the flag's own opposite word, not "not pinned".
      case 'is':
        return t(`chip_is_${term.negated ? IS_OPPOSITE[term.value] : term.value}`);
      case 'before':
        return t('chip_before', { value: formatSearchDay(term.value, i18n.language) });
      case 'after':
        return t('chip_after', { value: formatSearchDay(term.value, i18n.language) });
      default:
        return term.raw;
    }
  };

  const viewMode = settings?.viewMode ?? 'grid';
  const active = results?.active ?? [];
  const archived = results?.archived ?? [];
  usePublishViewOrder(useMemo(() => [...active, ...archived].map((n) => n.id), [active, archived]));
  const nothing = hasAny && active.length === 0 && archived.length === 0;

  return (
    <div className="px-3 py-4 md:px-6 md:py-6">
      {/* Active filter chips */}
      {(params.type ||
        params.label ||
        params.color ||
        params.collaborator ||
        operatorTerms.length > 0) && (
        <div className="mx-auto mb-6 flex max-w-[960px] flex-wrap items-center gap-2">
          {params.collaborator && (
            <FilterChip
              // A person can leave the last shared note while their filter is
              // still on: fall back to the raw id rather than an empty chip.
              label={activePerson ? activePerson.name || activePerson.email : params.collaborator}
              avatar={activePerson ? activePerson.name || activePerson.email : '?'}
              onClear={() => setParam({ collaborator: undefined })}
            />
          )}
          {params.type && (
            <FilterChip
              label={t(`type_${params.type}`)}
              onClear={() => setParam({ type: undefined })}
            />
          )}
          {params.label && (
            <FilterChip label={params.label} onClear={() => setParam({ label: undefined })} />
          )}
          {params.color && (
            <FilterChip
              label={t(`notes:color_${params.color}`)}
              swatch={params.color}
              onClear={() => setParam({ color: undefined })}
            />
          )}
          {operatorTerms.map((term) => (
            <FilterChip
              // Two identical tokens are two chips, so position is the identity.
              key={term.index}
              label={operatorChipLabel(term)}
              swatch={term.kind === 'color' && !term.negated ? term.value : undefined}
              onClear={() => dropTerm(term)}
            />
          ))}
        </div>
      )}

      {!hasAny ? (
        <div className="mx-auto flex max-w-[760px] flex-col gap-8">
          <TileSection title={t('typesSection')}>
            <TypeTile
              svg={checkboxSvg}
              label={t('type_list')}
              onClick={() => setParam({ type: 'list' })}
            />
            <TypeTile
              svg={linkSvg}
              label={t('type_url')}
              onClick={() => setParam({ type: 'url' })}
            />
            <TypeTile
              svg={imageSvg}
              label={t('type_image')}
              onClick={() => setParam({ type: 'image' })}
            />
            <TypeTile
              svg={audioSvg}
              label={t('type_audio')}
              onClick={() => setParam({ type: 'audio' })}
            />
            <TypeTile
              svg={brushSvg}
              label={t('type_drawing')}
              onClick={() => setParam({ type: 'drawing' })}
            />
            <TypeTile
              svg={notificationsSvg}
              label={t('type_reminder')}
              onClick={() => setParam({ type: 'reminder' })}
            />
          </TileSection>
          {labels && labels.length > 0 && (
            <TileSection title={t('labelsSection')}>
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="rounded-full bg-surface-container px-4 py-2 font-medium text-on-surface text-sm hover:shadow-(--elevation-2)"
                  onClick={() => setParam({ label: l.name })}
                >
                  {l.name}
                </button>
              ))}
            </TileSection>
          )}
          {people && people.length > 0 && (
            <TileSection title={t('peopleSection')}>
              {people.map((p) => (
                <PersonTile
                  key={p.userId}
                  name={p.name || p.email}
                  email={p.email}
                  onClick={() => setParam({ collaborator: p.userId })}
                />
              ))}
            </TileSection>
          )}
          <TileSection title={t('operatorsSection')}>
            <dl className="w-full text-sm">
              {OPERATOR_HELP.map(({ syntax, key }) => (
                <div key={key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1">
                  <dt className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-on-surface text-xs">
                    {syntax}
                  </dt>
                  <dd className="text-on-surface-variant">{t(key)}</dd>
                </div>
              ))}
            </dl>
          </TileSection>
          <TileSection title={t('colorsSection')}>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={t(`notes:color_${c}`)}
                data-tooltip={t(`notes:color_${c}`)}
                className="h-9 w-9 rounded-full border border-(--outline) transition-transform hover:scale-110"
                style={{ background: `var(--note-${c})` }}
                onClick={() => setParam({ color: c })}
              />
            ))}
          </TileSection>
        </div>
      ) : nothing ? (
        <EmptyView svg={searchSvg} text={t('noResults')} />
      ) : (
        <div className="mx-auto flex max-w-full flex-col gap-4">
          <NotesGrid notes={active} viewMode={viewMode} />
          {archived.length > 0 && (
            <>
              <h2 className="mx-auto w-full px-1 font-medium text-[0.6875rem] text-on-surface-variant uppercase tracking-wider">
                {t('archiveSection')}
              </h2>
              <NotesGrid notes={archived} viewMode={viewMode} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-medium text-[0.6875rem] text-on-surface-variant uppercase tracking-wider">
        {title}
      </h2>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  );
}

function TypeTile({ svg, label, onClick }: { svg: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-24 w-28 flex-col items-center justify-center gap-2 rounded-lg bg-surface-container text-on-surface transition-shadow hover:shadow-(--elevation-2)"
    >
      <Icon svg={svg} size={28} className="text-primary" />
      <span className="font-medium text-xs">{label}</span>
    </button>
  );
}

function PersonTile({
  name,
  email,
  onClick,
}: {
  name: string;
  email: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooltip={`${name} <${email}>`}
      className="flex h-24 w-28 flex-col items-center justify-center gap-2 rounded-lg bg-surface-container text-on-surface transition-shadow hover:shadow-(--elevation-2)"
    >
      <Initial name={name} className="h-8 w-8 text-sm" />
      <span className="max-w-full truncate px-2 font-medium text-xs">{name}</span>
    </button>
  );
}

/** The avatar we have: a monogram, same as the note card's collaborator strip. */
function Initial({ name, className }: { name: string; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center rounded-full bg-primary font-medium text-on-primary ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function FilterChip({
  label,
  swatch,
  avatar,
  onClear,
}: {
  label: string;
  swatch?: string;
  avatar?: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-accent-container py-1.5 pr-2 pl-3 font-medium text-on-surface text-sm">
      {avatar && <Initial name={avatar} className="-ml-1.5 h-5 w-5 text-[0.625rem]" />}
      {swatch && (
        <span
          className="h-4 w-4 rounded-full border border-(--outline)"
          style={{ background: `var(--note-${swatch})` }}
        />
      )}
      {label}
      <button
        type="button"
        aria-label={`× ${label}`}
        className="rounded-full px-1 text-on-surface-variant hover:text-on-surface"
        onClick={onClear}
      >
        ×
      </button>
    </span>
  );
}
