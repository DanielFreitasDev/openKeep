import { describe, expect, it } from 'vitest';
import { queryWords } from './note-selectors.js';
import { highlightHtml, highlightSegments } from './search-highlight.js';

/** Marked runs only, in order — what the eye actually sees on the card. */
const marked = (text: string, q: string) =>
  highlightSegments(text, queryWords(q))
    .filter((s) => s.match)
    .map((s) => s.text);

describe('highlightSegments', () => {
  it('marks the query word where it prefixes a word', () => {
    expect(marked('Comprar café hoje', 'caf')).toEqual(['caf']);
  });

  it('marks every query word, each time it occurs', () => {
    expect(marked('café com leite e café sem leite', 'café leite')).toEqual([
      'café',
      'leite',
      'café',
      'leite',
    ]);
  });

  it('ignores accents and case, the way the search does', () => {
    expect(marked('Ação da EQUIPE', 'acao equipe')).toEqual(['Ação', 'EQUIPE']);
  });

  it('does not mark inside a word — search only matches prefixes', () => {
    expect(marked('anotação', 'tacao')).toEqual([]);
  });

  it('marks as much of the word as the longest query word covers', () => {
    expect(marked('cafeteira', 'ca cafe')).toEqual(['cafe']);
  });

  it('marks a text that is nothing but the word searched', () => {
    expect(highlightSegments('Café', queryWords('café'))).toEqual([{ text: 'Café', match: true }]);
  });

  it('keeps the text whole when nothing matches', () => {
    expect(highlightSegments('nada aqui', queryWords('xyz'))).toEqual([
      { text: 'nada aqui', match: false },
    ]);
    expect(highlightSegments('nada aqui', [])).toEqual([{ text: 'nada aqui', match: false }]);
  });

  it('rebuilds the original text from its segments', () => {
    const text = 'café, leite; e pão';
    expect(
      highlightSegments(text, queryWords('cafe pao'))
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});

describe('highlightHtml', () => {
  it('marks words in the text and leaves the markup alone', () => {
    expect(highlightHtml('<p>Comprar <strong>café</strong></p>', queryWords('cafe'))).toBe(
      '<p>Comprar <strong><mark class="search-match">café</mark></strong></p>',
    );
  });

  it('never marks anything inside a tag', () => {
    const html = '<a href="https://cafe.example/cafe">site</a>';
    expect(highlightHtml(html, queryWords('cafe'))).toBe(html);
  });

  it('keeps entities whole rather than cutting one in half', () => {
    // "&amp;" is one character to the matcher: "amp" prefixes no word here.
    expect(highlightHtml('<p>Tom &amp; Jerry</p>', queryWords('amp'))).toBe(
      '<p>Tom &amp; Jerry</p>',
    );
    expect(highlightHtml('<p>Tom &amp; Jerry</p>', queryWords('jerry'))).toBe(
      '<p>Tom &amp; <mark class="search-match">Jerry</mark></p>',
    );
  });

  it('an entity is a word boundary of its own', () => {
    expect(highlightHtml('<p>a&nbsp;café</p>', queryWords('cafe'))).toBe(
      '<p>a&nbsp;<mark class="search-match">café</mark></p>',
    );
  });

  it('returns the html untouched when there is nothing to mark', () => {
    const html = '<p>Comprar café</p>';
    expect(highlightHtml(html, [])).toBe(html);
    expect(highlightHtml(html, queryWords('leite'))).toBe(html);
  });

  it('adds no text of its own', () => {
    const html = '<h1>Lista</h1><p>café &amp; leite<br>pão</p>';
    const out = highlightHtml(html, queryWords('cafe pao lista'));
    expect(out.replace(/<\/?mark[^>]*>/g, '')).toBe(html);
  });
});
