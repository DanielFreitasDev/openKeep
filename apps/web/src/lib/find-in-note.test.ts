import { Schema } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { findInDoc, findInText, foldForFind } from './find-in-note.js';

/** Just enough schema to build the shapes a note body can take. */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block' },
    horizontalRule: { group: 'block' },
    text: { group: 'inline' },
    hardBreak: { inline: true, group: 'inline', selectable: false },
  },
  marks: { bold: {} },
});

const p = (...inline: ReturnType<typeof schema.text>[]) =>
  schema.nodes.paragraph!.create(null, inline);
const t = (s: string, bold = false) =>
  schema.text(s, bold ? [schema.marks.bold!.create()] : undefined);
const br = () => schema.nodes.hardBreak!.create();
const doc = (...blocks: ReturnType<typeof p>[]) => schema.nodes.doc!.create(null, blocks);

describe('foldForFind', () => {
  it('folds case and accents without moving any offset', () => {
    const text = 'Ação Móvel — ÖSTERREICH';
    const folded = foldForFind(text);
    expect(folded).toBe('acao movel — osterreich');
    expect(folded.length).toBe(text.length);
  });

  it('leaves a character that would not fold one-for-one alone', () => {
    // "ß" uppercases to "SS" and a lone combining mark folds to nothing; either
    // one would shift every index after it.
    expect(foldForFind('Straße').length).toBe('Straße'.length);
    expect(foldForFind('é').length).toBe(2);
  });
});

describe('findInText', () => {
  it('finds every occurrence, ignoring case and accents', () => {
    expect(findInText('Comprar pão, comprar leite', 'comprar')).toEqual([
      { start: 0, end: 7 },
      { start: 13, end: 20 },
    ]);
    expect(findInText('Reunião de segunda', 'reuniao')).toEqual([{ start: 0, end: 7 }]);
  });

  it('does not overlap matches and treats an empty query as no search', () => {
    expect(findInText('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
    expect(findInText('anything', '')).toEqual([]);
  });
});

describe('findInDoc', () => {
  it('maps matches to document positions across blocks and marks', () => {
    // <p>hello world</p><p>hello</p> — the first paragraph splits into two text
    // nodes because "world" is bold, which must not break the match either way.
    const d = doc(p(t('hello '), t('world', true)), p(t('say hello')));
    expect(findInDoc(d, 'hello')).toEqual([
      { from: 1, to: 6 },
      { from: 18, to: 23 },
    ]);
  });

  it('never matches across a line break or a block boundary', () => {
    const d = doc(p(t('one'), br(), t('two')), p(t('three')));
    expect(findInDoc(d, 'onetwo')).toEqual([]);
    expect(findInDoc(d, 'two')).toEqual([{ from: 5, to: 8 }]);
    expect(findInDoc(d, 'three')).toEqual([{ from: 10, to: 15 }]);
  });

  it('returns nothing for an empty query', () => {
    expect(findInDoc(doc(p(t('text'))), '')).toEqual([]);
  });
});
