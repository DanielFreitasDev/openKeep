import { markdownToHtml, noteLinkHref } from '@openkeep/shared';
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { fixTables } from '@tiptap/pm/tables';
import {
  type Editor,
  Extension,
  InputRule,
  markInputRule,
  textblockTypeInputRule,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FindInNote } from './find-in-note.js';

/**
 * Keep's `#` quick-labeling, minus the one place it collided with markdown.
 *
 * `#` used to be swallowed everywhere, which meant `# ` never reached the
 * heading input rule. Now the character types normally at the start of an
 * empty block — the only place a markdown heading can begin — and an input
 * rule reclaims the gesture the moment the next character proves it was a
 * label after all (`#s…` opens the picker seeded with `s`). Anywhere else in
 * the text, `#` still opens the picker straight away, exactly as before.
 */
const QuickLabel = Extension.create<{ onQuickLabel?: (seed: string) => void }>({
  name: 'quickLabel',

  addOptions() {
    return { onQuickLabel: undefined };
  },

  addInputRules() {
    return [
      new InputRule({
        // `#` or `##` immediately followed by a non-space, non-`#` character.
        // Disjoint from the heading rule, which needs whitespace; longer runs
        // are left alone so `###…` can still become a deeper heading.
        find: /^(#{1,2})([^\s#])$/,
        handler: ({ range, match, chain }) => {
          chain().deleteRange(range).run();
          this.options.onQuickLabel?.(match[2] ?? '');
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { onQuickLabel } = this.options;
    return [
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== '#' || event.ctrlKey || event.metaKey) return false;
            const { $from, empty } = view.state.selection;
            // Heading syntax can only be building up while the block holds
            // nothing but the hashes typed so far — that covers every level
            // up to `######` and still hands `#` to the picker mid-text.
            const typedSoFar = $from.parent.textBetween(0, $from.parentOffset);
            const buildingHeading =
              empty &&
              $from.parentOffset === $from.parent.content.size &&
              /^#{0,5}$/.test(typedSoFar);
            if (buildingHeading) return false;
            event.preventDefault();
            onQuickLabel?.('');
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * `[[` — linking one note to another (Obsidian's gesture, not Keep's: Keep
 * treats every note as an isolated post-it).
 *
 * An input rule rather than a keydown handler, unlike `#`: the second bracket
 * is what makes the gesture, so there is nothing to decide on the first one —
 * a lone `[` is still the start of an ordinary markdown link. Input rules do
 * not run inside code, which is exactly right here too: `[[` in a code block
 * is code. The two characters are eaten and the picker takes over, so what
 * lands in the note is the link, never the brackets.
 */
const NoteLinkGesture = Extension.create<{ onNoteLink?: () => void }>({
  name: 'noteLinkGesture',

  addOptions() {
    return { onNoteLink: undefined };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).run();
          this.options.onNoteLink?.();
        },
      }),
    ];
  },
});

/**
 * The markdown gestures, replacing StarterKit's mark rules rather than adding
 * to them (see `NOTE_INPUT_RULES` for how the built-ins are switched off).
 *
 * Two things were wrong with the built-ins. They anchor on `(?:^|\s)`, and the
 * text TipTap matches against spells a hard break `%leaf%` — so from the
 * second line of a paragraph down (Shift+Enter, which is how a note gets a
 * line break) `**bold**` never fired at all. And they only reject a delimiter
 * hugging whitespace on the opening side, so typing `2 * 3 * 4` italicized the
 * middle of an arithmetic expression. The rules here take the break into the
 * anchor and guard both sides, matching the paste parser exactly: the same
 * text typed and pasted produces the same note.
 *
 * The anchor has to be a lookbehind rather than a consumed group: TipTap
 * re-checks a match against the document by length, and `%leaf%` is six
 * characters standing in for a one-position node — consuming it would put
 * every offset six characters out and the rule would be discarded.
 *
 * The fence rule is new rather than widened: StarterKit turns ``` into a code
 * block only once a space or a language follows, and a note is not a code
 * editor — three backticks mean "code block" the moment they are typed.
 */
const START = '(?:(?<=^)|(?<=\\s)|(?<=%leaf%))';

const MarkdownGestures = Extension.create({
  name: 'markdownGestures',
  // Above StarterKit, so the shortcut below is reached before its owner's.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      // Ctrl+Shift+8 is Keep's "show checkboxes" (it converts the whole note),
      // and bulletList claims the same combo. Keep parity wins; a bullet list
      // is still one `- ` or one toolbar button away.
      'Mod-Shift-8': () => true,
    };
  },

  addInputRules() {
    const { schema } = this.editor;
    const rules: InputRule[] = [];
    /** `delimiter` … `delimiter`, with no whitespace hugging either end. */
    const mark = (name: string, delimiter: string, inner: string) => {
      const type = schema.marks[name];
      if (!type) return;
      const find = new RegExp(
        `${START}(${delimiter}(?![\\s${inner}])([^${inner}]+?)(?<![\\s${inner}])${delimiter})$`,
      );
      rules.push(markInputRule({ find, type }));
    };

    mark('bold', '\\*\\*', '*');
    mark('bold', '__', '_');
    mark('italic', '\\*', '*');
    mark('italic', '_', '_');
    mark('strike', '~~', '~');
    mark('code', '`', '`');

    const codeBlock = schema.nodes.codeBlock;
    if (codeBlock) {
      rules.push(textblockTypeInputRule({ find: /^(?:```|~~~)$/, type: codeBlock }));
    }
    return rules;
  },
});

/**
 * Which extensions may run input rules — a whitelist, because the only way to
 * take StarterKit's looser mark rules out of the chain is to leave their
 * extensions off this list (a rule that matches first wins, so adding stricter
 * rules alongside them would change nothing).
 */
export const NOTE_INPUT_RULES = [
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'horizontalRule',
  'quickLabel',
  'noteLinkGesture',
  'markdownGestures',
];

/**
 * Pasting markdown as rich text. Only plain-text clipboards are inspected:
 * when the source app also offers `text/html` (a browser, a doc editor) that
 * is already richer than markdown, so ProseMirror's own path wins.
 */
const MarkdownPaste = Extension.create({
  name: 'markdownPaste',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const data = event.clipboardData;
            if (!data || data.getData('text/html')) return false;
            // Inside a code block the clipboard is code, not markdown.
            if (view.state.selection.$from.parent.type.spec.code) return false;
            const text = data.getData('text/plain');
            if (!text) return false;
            const html = markdownToHtml(text);
            if (html === null) return false;
            editor.commands.insertContent(html);
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * Cells with no attributes at all — the schema saying what the sanitizer says
 * (DECISIONS #37). `colspan`/`rowspan` stay in the schema because
 * prosemirror-tables reads them to build its column map, but they are pinned
 * at 1 on the way in and never rendered, so a merged cell pasted from a web
 * page arrives as plain cells instead of as a merge the next save would undo.
 * `colwidth` and `align` are dropped outright: nothing in the note vocabulary
 * can carry a width or an alignment.
 */
const SIMPLE_CELL_ATTRIBUTES = {
  colspan: { default: 1, rendered: false, parseHTML: () => 1 },
  rowspan: { default: 1, rendered: false, parseHTML: () => 1 },
};

const SimpleTableCell = TableCell.extend({ addAttributes: () => SIMPLE_CELL_ATTRIBUTES });
const SimpleTableHeader = TableHeader.extend({ addAttributes: () => SIMPLE_CELL_ATTRIBUTES });

/**
 * Keeps every table rectangular. Un-merging a pasted cell leaves its row a
 * cell short, and html written straight through the API can be ragged from
 * the start; `fixTables` fills the holes as soon as either lands, so the grid
 * on screen is always the grid that serializes back to `|---|`.
 */
const RectangularTables = Extension.create({
  name: 'rectangularTables',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (_transactions, oldState, newState) =>
          fixTables(newState, oldState)?.setMeta('addToHistory', false),
      }),
    ];
  },
});

/**
 * The note rich-text feature set: Keep's allowlist plus everything markdown
 * expresses (NOTE_HTML_TAGS on the server sanitizer, DECISIONS #26). Shared so
 * the composer and the editor modal stay identical.
 *
 * `onQuickLabel` receives the seed the user already typed, so the label picker
 * opens filtered; `onNoteLink` opens the note picker for the `[[` gesture.
 */
export function noteExtensions(
  placeholder: string,
  onQuickLabel?: (seed: string) => void,
  onNoteLink?: () => void,
) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: {
        // Typed URLs stay plain text: that is what feeds the link-preview
        // chips, and autolinking would rewrite a URL mid-typing.
        autolink: false,
        openOnClick: true,
        protocols: ['mailto'],
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      },
    }),
    TableKit.configure({
      // No resizing and no node view: what the editor shows is the markup the
      // server stores, minus the colgroup the renderer insists on adding.
      table: { resizable: false, View: null },
      tableCell: false,
      tableHeader: false,
    }),
    SimpleTableCell,
    SimpleTableHeader,
    RectangularTables,
    Placeholder.configure({ placeholder }),
    QuickLabel.configure({ onQuickLabel }),
    NoteLinkGesture.configure({ onNoteLink }),
    MarkdownGestures,
    MarkdownPaste,
    // Idle until the editor's find bar hands it a query (the composer never
    // does), and decoration-only either way.
    FindInNote,
  ];
}

/**
 * Inserts a link to another note at the cursor, labelled with its title.
 *
 * The label is a copy, not a reference: renaming the target later leaves this
 * text alone. That is the markdown the note serializes to — `[label](href)` —
 * and it is also the kinder behavior, since the sentence the link sits in was
 * written around the words that were there.
 *
 * The trailing space is what ends the link: the mark is non-inclusive, so
 * typing on carries plain text, and without the space the caret would sit
 * flush against the link with nowhere to stand.
 */
export function insertNoteLink(editor: Editor, noteId: string, label: string): void {
  editor
    .chain()
    .focus()
    .insertContent([
      {
        type: 'text',
        text: label,
        marks: [{ type: 'link', attrs: { href: noteLinkHref(noteId) } }],
      },
      { type: 'text', text: ' ' },
    ])
    .run();
}

/** Applies a link to the selection, or clears it when the url is empty. */
export function applyLink(editor: Editor, url: string): void {
  const href = url.trim();
  if (href === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) ? href : `https://${href}`;
  editor.chain().focus().extendMarkRange('link').setLink({ href: withScheme }).run();
}
