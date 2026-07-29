import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

/**
 * The note rich-text feature set — Keep's allowlist (headings, bold/italic/
 * underline). Shared so the composer and the editor modal stay identical.
 */
export function noteExtensions(placeholder: string) {
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
  ];
}
