import { describe, expect, it } from 'vitest';
import { formatSearchTerms, parseSearchQuery } from './search-query.js';

describe('parseSearchQuery', () => {
  it('keeps plain text as text', () => {
    const q = parseSearchQuery('  compras   de  café ');
    expect(q.text).toEqual(['compras', 'de', 'café']);
    expect(q.isEmpty).toBe(false);
    expect(q.terms.every((t) => t.kind === 'text')).toBe(true);
  });

  it('is empty for a blank query', () => {
    expect(parseSearchQuery('   ').isEmpty).toBe(true);
    expect(parseSearchQuery('').terms).toEqual([]);
  });

  it('reads every operator', () => {
    const q = parseSearchQuery('label:mercado color:blue has:list is:pinned before:2026-01-01');
    expect(q.labels).toEqual(['mercado']);
    expect(q.colors).toEqual(['fog']); // blue is the everyday word for the fog swatch
    expect(q.has).toEqual(['list']);
    expect(q.pinned).toBe(true);
    expect(q.before).toBe('2026-01-01');
    expect(q.text).toEqual([]);
  });

  it('negates text and operators, and spells the negative flags out', () => {
    const q = parseSearchQuery('-café -label:trabalho -has:image is:unarchived');
    expect(q.exclude).toEqual(['café']);
    expect(q.notLabels).toEqual(['trabalho']);
    expect(q.notHas).toEqual(['image']);
    expect(q.archived).toBe(false);
    expect(parseSearchQuery('-is:pinned').pinned).toBe(false);
  });

  it('ANDs labels, ORs colors', () => {
    const q = parseSearchQuery('label:a label:b color:coral color:sand');
    expect(q.labels).toEqual(['a', 'b']);
    expect(q.colors).toEqual(['coral', 'sand']);
  });

  it('takes quoted values whole', () => {
    const q = parseSearchQuery('label:"lista de compras" arroz');
    expect(q.labels).toEqual(['lista de compras']);
    expect(q.text).toEqual(['arroz']);
  });

  it('runs an unterminated quote to the end rather than dropping the query', () => {
    const q = parseSearchQuery('label:"lista de');
    expect(q.labels).toEqual(['lista de']);
  });

  it('leaves what it does not understand as text', () => {
    // An unknown key, an invalid value, a url and a bare colon are all words.
    expect(parseSearchQuery('foo:bar').text).toEqual(['foo:bar']);
    expect(parseSearchQuery('color:banana').text).toEqual(['color:banana']);
    expect(parseSearchQuery('has:pdf').text).toEqual(['has:pdf']);
    expect(parseSearchQuery('https://example.com/x').text).toEqual(['https://example.com/x']);
    expect(parseSearchQuery('label:').text).toEqual(['label:']);
  });

  it('rejects dates that are not days, and negated dates', () => {
    expect(parseSearchQuery('before:2026-02-31').before).toBeUndefined();
    expect(parseSearchQuery('after:2026-1-1').after).toBeUndefined();
    // A range has no negative, so `-before:` is just a word to exclude.
    expect(parseSearchQuery('-before:2026-01-01').before).toBeUndefined();
    expect(parseSearchQuery('-before:2026-01-01').exclude).toEqual(['before:2026-01-01']);
  });

  it('is case-insensitive on keys and values, but keeps label names as typed', () => {
    const q = parseSearchQuery('LABEL:Mercado Color:CORAL IS:Pinned');
    expect(q.labels).toEqual(['Mercado']);
    expect(q.colors).toEqual(['coral']);
    expect(q.pinned).toBe(true);
  });

  it('rebuilds the query from its terms (chip removal)', () => {
    const q = parseSearchQuery('café label:"lista de compras" -is:pinned');
    expect(formatSearchTerms(q.terms)).toBe('café label:"lista de compras" -is:pinned');
    const withoutLabel = q.terms.filter((t) => t.kind !== 'label');
    expect(formatSearchTerms(withoutLabel)).toBe('café -is:pinned');
  });
});
