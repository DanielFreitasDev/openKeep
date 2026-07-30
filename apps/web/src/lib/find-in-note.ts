import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { type Editor, Extension } from '@tiptap/react';

export interface TextMatch {
  start: number;
  end: number;
}

export interface DocMatch {
  from: number;
  to: number;
}

const DIACRITICS = /[\u0300-\u036f]/g;

/**
 * Case- and accent-insensitive folding that keeps the string's length, so a
 * match index still points at the same character of the original text. That is
 * the difference from `normalizeForSearch` (note-selectors), which only feeds a
 * tokenizer and is free to change length: here every offset becomes either a
 * document position or a `setSelectionRange` argument.
 *
 * Anything that does not fold to exactly one character (ß → "ss", a lone
 * combining mark → "") is left as it stands rather than shifting the ruler.
 */
export function foldForFind(text: string): string {
  let out = '';
  for (const ch of text) {
    const folded = ch.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
    out += folded.length === ch.length ? folded : ch;
  }
  return out;
}

/** Non-overlapping matches of `query` in `text`, left to right. */
export function findInText(text: string, query: string): TextMatch[] {
  if (query === '') return [];
  const needle = foldForFind(query);
  const haystack = foldForFind(text);
  const out: TextMatch[] = [];
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    out.push({ start: at, end: at + needle.length });
    at = haystack.indexOf(needle, at + needle.length);
  }
  return out;
}

/**
 * The same matches over a ProseMirror document, as absolute positions.
 *
 * Each textblock is searched on its own: a query never spans two blocks, and
 * within a block every inline leaf (a hard break, in this vocabulary) stands in
 * as a newline so it occupies exactly the one position it has in the document
 * and a match cannot silently jump the line.
 */
export function findInDoc(doc: PMNode, query: string): DocMatch[] {
  const out: DocMatch[] = [];
  if (query === '') return out;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText) {
        const chunk = child.text ?? '';
        for (let i = 0; i < chunk.length; i++) positions.push(start + i);
        text += chunk;
      } else {
        positions.push(start);
        text += '\n';
      }
    });
    for (const match of findInText(text, query)) {
      const from = positions[match.start];
      const last = positions[match.end - 1];
      if (from === undefined || last === undefined) continue;
      out.push({ from, to: last + 1 });
    }
    return false;
  });
  return out;
}

interface FindPluginState {
  query: string;
  /** Index into `matches` of the highlighted one; -1 when it is elsewhere. */
  current: number;
  matches: DocMatch[];
  decorations: DecorationSet;
}

const EMPTY_STATE: FindPluginState = {
  query: '',
  current: -1,
  matches: [],
  decorations: DecorationSet.empty,
};

export const findPluginKey = new PluginKey<FindPluginState>('findInNote');

function decorate(doc: PMNode, matches: DocMatch[], current: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === current ? 'find-match find-match-current' : 'find-match',
      }),
    ),
  );
}

/**
 * Highlights the find matches in the body. The plugin owns the match list —
 * the bar asks for a query and reads back how many there were — so the doc it
 * decorates and the doc it counted are the same one, edits included.
 */
export const FindInNote = Extension.create({
  name: 'findInNote',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindPluginState>({
        key: findPluginKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(findPluginKey) as
              | { query: string; current: number }
              | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            if (query === '') return EMPTY_STATE;
            const matches = findInDoc(newState.doc, query);
            const current = meta?.current ?? prev.current;
            return {
              query,
              current,
              matches,
              decorations: decorate(newState.doc, matches, current),
            };
          },
        },
        props: {
          decorations: (state) => findPluginKey.getState(state)?.decorations ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

/**
 * Points the highlight at `query`/`current`. Nothing about the document
 * changes, so the transaction stays out of the undo stack and out of TipTap's
 * `update` event — the autosave must not see a search as an edit.
 */
export function applyFind(editor: Editor, query: string, current: number): void {
  const state = findPluginKey.getState(editor.state);
  if (state && state.query === query && state.current === current) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(findPluginKey, { query, current }).setMeta('addToHistory', false),
  );
}

/** How many matches the body holds for the query it was last given. */
export function findMatchCount(editor: Editor): number {
  return findPluginKey.getState(editor.state)?.matches.length ?? 0;
}
