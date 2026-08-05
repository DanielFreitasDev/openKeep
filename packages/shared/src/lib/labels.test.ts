import { describe, expect, it } from 'vitest';
import {
  findLabelByPath,
  flattenLabelTree,
  isLabelDescendant,
  type LabelNode,
  labelPath,
  labelPathMap,
  labelSubtreeIds,
  sortLabels,
  splitLabelPath,
} from './labels.js';

const node = (id: string, name: string, parentId: string | null, position = 'a0'): LabelNode => ({
  id,
  name,
  parentId,
  position,
});

/** work → clients → acme, plus a second "Ideas" that only differs by parent. */
const TREE: LabelNode[] = [
  node('work', 'Work', null, 'a0'),
  node('clients', 'Clients', 'work', 'a0'),
  node('acme', 'ACME', 'clients', 'a0'),
  node('work-ideas', 'Ideas', 'work', 'a1'),
  node('personal', 'Personal', null, 'a1'),
  node('personal-ideas', 'Ideas', 'personal', 'a0'),
];

describe('splitLabelPath', () => {
  it('trims segments and drops empty ones', () => {
    expect(splitLabelPath(' Work / Clients ')).toEqual(['Work', 'Clients']);
    expect(splitLabelPath('//Work//')).toEqual(['Work']);
    expect(splitLabelPath('   ')).toEqual([]);
  });
});

describe('labelPath', () => {
  it('joins the ancestry, root first', () => {
    expect(labelPath(TREE, 'acme')).toBe('Work/Clients/ACME');
    expect(labelPath(TREE, 'work')).toBe('Work');
  });

  it('returns the same paths as the bulk map', () => {
    const map = labelPathMap(TREE);
    for (const l of TREE) expect(map.get(l.id)).toBe(labelPath(TREE, l.id));
  });

  it('does not loop on a cyclic row', () => {
    const cyclic = [node('a', 'A', 'b'), node('b', 'B', 'a')];
    expect(labelPath(cyclic, 'a')).toBe('B/A');
    expect(labelPathMap(cyclic).size).toBe(2);
  });
});

describe('findLabelByPath', () => {
  it('resolves a nested path case-insensitively', () => {
    expect(findLabelByPath(TREE, 'work/clients/acme')?.id).toBe('acme');
    expect(findLabelByPath(TREE, ' Work / Ideas ')?.id).toBe('work-ideas');
  });

  it('distinguishes same-named labels by their parent', () => {
    expect(findLabelByPath(TREE, 'Work/Ideas')?.id).toBe('work-ideas');
    expect(findLabelByPath(TREE, 'Personal/Ideas')?.id).toBe('personal-ideas');
  });

  it('resolves a bare name when it is unique in the account', () => {
    expect(findLabelByPath(TREE, 'ACME')?.id).toBe('acme');
  });

  it('refuses a bare name that two labels answer to', () => {
    expect(findLabelByPath(TREE, 'Ideas')).toBeUndefined();
  });

  it('still prefers the root label over a unique deeper namesake', () => {
    const shadowed = [...TREE, node('root-acme', 'ACME', null, 'a2')];
    expect(findLabelByPath(shadowed, 'ACME')?.id).toBe('root-acme');
  });

  it('falls back to a literal name for labels created before "/" was reserved', () => {
    const legacy = [...TREE, node('legacy', 'a/b', null, 'a2')];
    expect(findLabelByPath(legacy, 'a/b')?.id).toBe('legacy');
  });

  it('prefers the path reading over the literal one', () => {
    const both = [node('a', 'A', null), node('b', 'B', 'a'), node('literal', 'A/B', null, 'a1')];
    expect(findLabelByPath(both, 'A/B')?.id).toBe('b');
  });

  it('returns nothing for an unknown path', () => {
    expect(findLabelByPath(TREE, 'Nope/Nope')).toBeUndefined();
    expect(findLabelByPath(TREE, '')).toBeUndefined();
  });
});

describe('labelSubtreeIds', () => {
  it('includes the root and every descendant', () => {
    expect(labelSubtreeIds(TREE, 'work').sort()).toEqual(
      ['work', 'clients', 'acme', 'work-ideas'].sort(),
    );
    expect(labelSubtreeIds(TREE, 'acme')).toEqual(['acme']);
  });

  it('terminates on a cycle', () => {
    const cyclic = [node('a', 'A', 'b'), node('b', 'B', 'a')];
    expect(labelSubtreeIds(cyclic, 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('isLabelDescendant', () => {
  it('counts the label itself, which is what blocks self-parenting', () => {
    expect(isLabelDescendant(TREE, 'work', 'work')).toBe(true);
    expect(isLabelDescendant(TREE, 'acme', 'work')).toBe(true);
    expect(isLabelDescendant(TREE, 'work', 'acme')).toBe(false);
  });
});

describe('sortLabels', () => {
  it('orders by position, then name', () => {
    const rows = [node('b', 'Beta', null, 'a1'), node('a', 'Alpha', null, 'a0')];
    expect(sortLabels(rows).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('breaks position ties on the name, case-insensitively', () => {
    const rows = [node('b', 'beta', null, 'a0'), node('a', 'Alpha', null, 'a0')];
    expect(sortLabels(rows).map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('flattenLabelTree', () => {
  it('walks depth-first carrying depth and path', () => {
    expect(flattenLabelTree(TREE).map((f) => [f.path, f.depth])).toEqual([
      ['Work', 0],
      ['Work/Clients', 1],
      ['Work/Clients/ACME', 2],
      ['Work/Ideas', 1],
      ['Personal', 0],
      ['Personal/Ideas', 1],
    ]);
  });

  it('prunes collapsed subtrees but keeps the row that has them', () => {
    const flat = flattenLabelTree(TREE, (l) => l.id !== 'work');
    expect(flat.map((f) => f.path)).toEqual(['Work', 'Personal', 'Personal/Ideas']);
    expect(flat[0]?.hasChildren).toBe(true);
  });

  it('treats a row whose parent is absent as a root', () => {
    const orphan = [node('acme', 'ACME', 'gone')];
    expect(flattenLabelTree(orphan).map((f) => [f.path, f.depth])).toEqual([['ACME', 0]]);
  });
});
