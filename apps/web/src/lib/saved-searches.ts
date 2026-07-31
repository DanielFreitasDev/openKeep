import type { SavedSearch } from '@openkeep/shared';

/** The search screen's URL: free text plus the tile filters, as typed. */
export interface SearchParams {
  q: string;
  type?: string;
  label?: string;
  color?: string;
  collaborator?: string;
}

/**
 * A token whose value can hold spaces has to travel quoted, the way the box
 * itself accepts it. A quote inside the value has no escape in this language —
 * the tokenizer ends the quoted run at the next `"` — so it is dropped rather
 * than left to split the token in two.
 */
function quote(value: string): string {
  const clean = value.replace(/"/g, '');
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

/**
 * The canonical string for a search: the query language already spells the
 * type, label and color tiles (`has:`, `label:`, `color:`), so folding them in
 * leaves one representation to store, show and hand to an agent — never a
 * saved shortcut whose filters live half in a string and half beside it.
 * The People tile is the exception, and stays a field of its own.
 */
export function toSavedQuery(params: SearchParams): string {
  return [
    params.q.trim(),
    params.type && `has:${params.type}`,
    params.label && `label:${quote(params.label)}`,
    params.color && `color:${params.color}`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The saved entry the current screen already is, if any — identity is the search itself, not its name. */
export function findSaved(saved: SavedSearch[], params: SearchParams): SavedSearch | undefined {
  const q = toSavedQuery(params);
  return saved.find(
    (s) => s.q === q && (s.collaborator ?? undefined) === (params.collaborator || undefined),
  );
}

/** Route search object for a saved entry — `undefined` keeps empty params out of the URL. */
export function savedSearchTarget(saved: SavedSearch): {
  q: string;
  collaborator: string | undefined;
} {
  return { q: saved.q, collaborator: saved.collaborator || undefined };
}
