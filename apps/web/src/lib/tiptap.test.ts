// @vitest-environment happy-dom
import { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTE_INPUT_RULES, noteExtensions } from './tiptap.js';

/**
 * Input rules are the whole point of "the note understands markdown as you
 * type", and they are invisible to every other kind of test: the editor's
 * html only shows the result, and e2e can only reach them through a real
 * browser. Typing here goes through ProseMirror's own `handleTextInput` path,
 * one character at a time — the same hook a keystroke lands on.
 */

let editor: Editor | null = null;

function makeEditor(): Editor {
  editor = new Editor({
    extensions: noteExtensions('Note'),
    enableInputRules: NOTE_INPUT_RULES,
    enablePasteRules: false,
    content: '',
  });
  editor.commands.focus('end');
  return editor;
}

function type(ed: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = ed.state.selection;
    const handled = ed.view.someProp('handleTextInput', (fn) =>
      // The fifth argument is the "would insert" callback ProseMirror passes
      // for composition; input rules never call it.
      fn(ed.view, from, to, char, () => ed.state.tr),
    );
    if (!handled) ed.view.dispatch(ed.state.tr.insertText(char, from, to));
  }
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('typing markdown', () => {
  it('makes headings from every level', () => {
    const ed = makeEditor();
    type(ed, '# One');
    expect(ed.getHTML()).toContain('<h1>One</h1>');

    ed.commands.setContent('');
    type(ed, '#### Four');
    expect(ed.getHTML()).toContain('<h4>Four</h4>');
  });

  it('applies marks at the start of a block', () => {
    const ed = makeEditor();
    type(ed, '**bold** and *italic* and ~~gone~~ and `code`');
    const html = ed.getHTML();
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<s>gone</s>');
    expect(html).toContain('<code>code</code>');
  });

  it('applies marks after a hard break, where the built-in rules gave up', () => {
    const ed = makeEditor();
    type(ed, 'first line');
    ed.commands.setHardBreak();
    type(ed, '**bold** here');
    expect(ed.getHTML()).toContain('<strong>bold</strong>');
  });

  it('opens a code block on the third backtick alone', () => {
    const ed = makeEditor();
    type(ed, '```');
    expect(ed.isActive('codeBlock')).toBe(true);
    type(ed, 'const a = 1 < 2;');
    expect(ed.getHTML()).toContain('<pre><code>const a = 1 &lt; 2;</code></pre>');
  });

  it('leaves markdown alone inside a code block', () => {
    const ed = makeEditor();
    type(ed, '```');
    type(ed, '**not bold**');
    expect(ed.getHTML()).not.toContain('<strong>');
  });

  it('builds lists, quotes and rules', () => {
    const ed = makeEditor();
    type(ed, '- item');
    expect(ed.getHTML()).toContain('<ul><li><p>item</p></li></ul>');

    ed.commands.setContent('');
    type(ed, '1. item');
    expect(ed.getHTML()).toContain('<ol><li><p>item</p></li></ol>');

    ed.commands.setContent('');
    type(ed, '> quoted');
    expect(ed.getHTML()).toContain('<blockquote><p>quoted</p></blockquote>');

    ed.commands.setContent('');
    type(ed, '--- ');
    expect(ed.getHTML()).toContain('<hr>');
  });

  it('leaves prose that merely contains the delimiters alone', () => {
    const ed = makeEditor();
    type(ed, '2 * 3 * 4 and snake_case_name');
    const html = ed.getHTML();
    expect(html).not.toContain('<em>');
    expect(html).not.toContain('<strong>');
  });
});
