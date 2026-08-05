/**
 * Label hierarchy: the tree lives in one nullable `parentId`, and everything
 * that used to address a label by name now addresses it by **path** —
 * `Work/Clients/ACME`. Names are only unique among siblings, so the path is the
 * shortest thing that still identifies a label across the account.
 *
 * These helpers are deliberately pure and take the whole label list: it is
 * capped at 50 per account, so walking it beats any index we could cache.
 */

/** The minimum a row needs for the tree — DTOs and DB rows both satisfy it. */
export interface LabelNode {
  id: string;
  name: string;
  parentId: string | null;
  position: string;
}

/**
 * Separates path segments. Also the one character a label name may not
 * contain, because a name that held it would be indistinguishable from
 * a path (see `zLabelName`).
 */
export const LABEL_PATH_SEPARATOR = '/';

/** `" Work / Clients "` → `['Work', 'Clients']`; empty segments are dropped. */
export function splitLabelPath(path: string): string[] {
  return path
    .split(LABEL_PATH_SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * Ancestors first, the label itself last. Cycles cannot happen (the server
 * refuses them), but the visited set means a corrupt row loops nothing.
 */
export function labelAncestry<T extends LabelNode>(labels: T[], labelId: string): T[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const chain: T[] = [];
  const seen = new Set<string>();
  let cur = byId.get(labelId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/** The addressable path of a label: `Work/Clients/ACME`. */
export function labelPath(labels: LabelNode[], labelId: string): string {
  return labelAncestry(labels, labelId)
    .map((l) => l.name)
    .join(LABEL_PATH_SEPARATOR);
}

/** Every path at once — one pass instead of one ancestry walk per label. */
export function labelPathMap(labels: LabelNode[]): Map<string, string> {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const paths = new Map<string, string>();
  const resolve = (id: string, seen: Set<string>): string => {
    const cached = paths.get(id);
    if (cached !== undefined) return cached;
    const label = byId.get(id);
    if (!label || seen.has(id)) return '';
    seen.add(id);
    const path = label.parentId
      ? `${resolve(label.parentId, seen)}${LABEL_PATH_SEPARATOR}${label.name}`
      : label.name;
    paths.set(id, path);
    return path;
  };
  for (const l of labels) resolve(l.id, new Set());
  return paths;
}

/**
 * Resolve `Work/Clients` to a label, case-insensitively, walking down one
 * segment at a time. Three readings, in order:
 *
 * 1. The path, anchored at the root — the documented meaning, always wins.
 * 2. A bare name that is unique in the whole account: `Clients` finds
 *    `Work/Clients` as long as nothing else is called that. Uniqueness is only
 *    per level now, so this is a convenience that withdraws itself the moment
 *    it would have to guess — `Ideas` under two parents resolves to neither.
 * 3. The literal name, for labels created before `/` was reserved. `a/b` is
 *    read as a path first and only then as the name it used to be; those stay
 *    reachable, they just cannot be created any more.
 */
export function findLabelByPath<T extends LabelNode>(labels: T[], path: string): T | undefined {
  const segments = splitLabelPath(path);
  if (segments.length === 0) return undefined;

  let parentId: string | null = null;
  let found: T | undefined;
  for (const segment of segments) {
    const needle = segment.toLowerCase();
    found = labels.find((l) => l.parentId === parentId && l.name.toLowerCase() === needle);
    if (!found) break;
    parentId = found.id;
  }
  if (found) return found;

  if (segments.length === 1) {
    const needle = segments[0]!.toLowerCase();
    const matches = labels.filter((l) => l.name.toLowerCase() === needle);
    return matches.length === 1 ? matches[0] : undefined;
  }

  const literal = path.trim().toLowerCase();
  return labels.find((l) => l.name.toLowerCase() === literal);
}

/** Direct children, in sibling order. */
export function labelChildren<T extends LabelNode>(labels: T[], parentId: string | null): T[] {
  return sortLabels(labels.filter((l) => l.parentId === parentId));
}

/**
 * The label and everything under it. This is what a label view filters by:
 * opening "Work" shows the notes of "Work/Clients/ACME" too, which is the
 * whole point of a folder.
 */
export function labelSubtreeIds(labels: LabelNode[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const l of labels) {
    if (!l.parentId) continue;
    const siblings = childrenOf.get(l.parentId);
    if (siblings) siblings.push(l.id);
    else childrenOf.set(l.parentId, [l.id]);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}

/** True when `candidateId` sits anywhere under `ancestorId` (itself counts). */
export function isLabelDescendant(
  labels: LabelNode[],
  candidateId: string,
  ancestorId: string,
): boolean {
  return labelSubtreeIds(labels, ancestorId).includes(candidateId);
}

/** Sibling order: the manual position first, the name only as the tiebreak. */
export function sortLabels<T extends LabelNode>(labels: T[]): T[] {
  return [...labels].sort(
    (a, b) =>
      (a.position < b.position ? -1 : a.position > b.position ? 1 : 0) ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
}

export interface FlatLabel<T extends LabelNode> {
  label: T;
  depth: number;
  path: string;
  hasChildren: boolean;
}

/**
 * Depth-first flatten — the order the sidebar and the edit dialog render, with
 * the depth each row indents by. `isOpen` prunes collapsed subtrees; omitted,
 * the whole tree comes back.
 *
 * Orphans (a parent that is not in the list) are treated as roots so a partial
 * list never silently hides rows.
 */
export function flattenLabelTree<T extends LabelNode>(
  labels: T[],
  isOpen?: (label: T) => boolean,
): FlatLabel<T>[] {
  const ids = new Set(labels.map((l) => l.id));
  const roots = labels.filter((l) => !l.parentId || !ids.has(l.parentId));
  const out: FlatLabel<T>[] = [];

  const walk = (nodes: T[], depth: number, prefix: string) => {
    for (const label of sortLabels(nodes)) {
      const children = labels.filter((l) => l.parentId === label.id);
      const path = prefix === '' ? label.name : `${prefix}${LABEL_PATH_SEPARATOR}${label.name}`;
      out.push({ label, depth, path, hasChildren: children.length > 0 });
      if (children.length > 0 && (!isOpen || isOpen(label))) walk(children, depth + 1, path);
    }
  };
  walk(roots, 0, '');
  return out;
}
