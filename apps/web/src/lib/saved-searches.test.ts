import type { SavedSearch } from '@openkeep/shared';
import { parseSearchQuery } from '@openkeep/shared';
import { describe, expect, it } from 'vitest';
import { findSaved, savedSearchTarget, toSavedQuery } from './saved-searches.js';

const saved = (over: Partial<SavedSearch>): SavedSearch => ({
  id: 'a',
  name: 'Shopping',
  q: 'milk',
  ...over,
});

describe('toSavedQuery', () => {
  it('keeps a plain query as typed', () => {
    expect(toSavedQuery({ q: '  milk bread  ' })).toBe('milk bread');
  });

  it('folds the tile filters into the query language', () => {
    expect(toSavedQuery({ q: 'milk', type: 'list', label: 'market', color: 'coral' })).toBe(
      'milk has:list label:market color:coral',
    );
  });

  it('quotes a label whose name has spaces, so it stays one token', () => {
    const q = toSavedQuery({ q: '', label: 'to do' });
    expect(q).toBe('label:"to do"');
    expect(parseSearchQuery(q).labels).toEqual(['to do']);
  });

  // A quote has no escape in this language: keeping it would end the token
  // early and turn the rest of the name into free text.
  it('drops quotes from a label name', () => {
    expect(toSavedQuery({ q: '', label: 'say "hi"' })).toBe('label:"say hi"');
  });

  it('round-trips through the parser both ends already share', () => {
    const parsed = parseSearchQuery(toSavedQuery({ q: '-old', type: 'image', color: 'fog' }));
    expect(parsed.exclude).toEqual(['old']);
    expect(parsed.has).toEqual(['image']);
    expect(parsed.colors).toEqual(['fog']);
  });
});

describe('findSaved', () => {
  it('recognizes the screen it was saved from, tiles and all', () => {
    const list = [saved({ q: 'milk has:list' })];
    expect(findSaved(list, { q: 'milk', type: 'list' })?.id).toBe('a');
  });

  it('does not match a search that gained a filter', () => {
    expect(findSaved([saved({ q: 'milk' })], { q: 'milk', color: 'coral' })).toBeUndefined();
  });

  it('treats the collaborator as part of the identity', () => {
    const list = [saved({ q: 'milk', collaborator: 'u1' })];
    expect(findSaved(list, { q: 'milk', collaborator: 'u1' })?.id).toBe('a');
    expect(findSaved(list, { q: 'milk' })).toBeUndefined();
    expect(findSaved([saved({ q: 'milk' })], { q: 'milk', collaborator: 'u1' })).toBeUndefined();
  });
});

describe('savedSearchTarget', () => {
  it('leaves an absent collaborator out of the URL', () => {
    expect(savedSearchTarget(saved({}))).toEqual({ q: 'milk', collaborator: undefined });
    expect(savedSearchTarget(saved({ collaborator: 'u1' })).collaborator).toBe('u1');
  });
});
