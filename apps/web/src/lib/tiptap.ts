import { Placeholder } from '@tiptap/extensions';
import { Plugin } from '@tiptap/pm/state';
import { Extension, InputRule } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { markdownToHtml } from './markdown.js';

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
        // Disjoint from the heading rule, which needs whitespace; `###` is
        // left alone because H3 is outside the note vocabulary.
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
            // nothing but the hashes typed so far — that covers `##` for H2
            // and lets `###…` stay literal text instead of tripping the
            // picker on its third keystroke.
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
          handlePaste: (_view, event) => {
            const data = event.clipboardData;
            if (!data || data.getData('text/html')) return false;
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
 * The note rich-text feature set — Keep's allowlist (headings, bold/italic/
 * underline). Shared so the composer and the editor modal stay identical.
 *
 * `onQuickLabel` receives the seed the user already typed, so the label picker
 * opens filtered.
 */
export function noteExtensions(placeholder: string, onQuickLabel?: (seed: string) => void) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2] },
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      link: false,
    }),
    Placeholder.configure({ placeholder }),
    QuickLabel.configure({ onQuickLabel }),
    MarkdownPaste,
  ];
}
