/**
 * Complete verified Keep web shortcut map. Single source of truth for both the
 * keyboard engine and the "?" help dialog (grouped + labeled via i18n keys).
 *
 * `keys` are engine bindings (see apps/web keyboard manager). `display` is what
 * the help dialog renders. Scope determines where the binding is active.
 */
export type ShortcutScope = 'base' | 'grid' | 'editor' | 'dialog';

export interface ShortcutDef {
  id: string;
  /** Engine bindings: `mod` = Ctrl (Cmd on macOS). */
  keys: string[];
  display: string;
  scope: ShortcutScope;
  /** i18n key under the `shortcuts` namespace. */
  labelKey: string;
  group: 'navigation' | 'application' | 'actions' | 'editor';
}

export const SHORTCUTS: ShortcutDef[] = [
  // Navigation
  {
    id: 'nav-next-note',
    keys: ['j'],
    display: 'j',
    scope: 'grid',
    labelKey: 'navNextNote',
    group: 'navigation',
  },
  {
    id: 'nav-prev-note',
    keys: ['k'],
    display: 'k',
    scope: 'grid',
    labelKey: 'navPrevNote',
    group: 'navigation',
  },
  {
    // Owned by the card itself (roving tabindex), not by the engine: arrows
    // must keep scrolling the page whenever no card holds focus.
    id: 'nav-arrows',
    keys: ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'],
    display: '↑ ↓ ← →',
    scope: 'grid',
    labelKey: 'navArrows',
    group: 'navigation',
  },
  {
    id: 'move-note-down',
    keys: ['shift+j'],
    display: 'Shift + j',
    scope: 'grid',
    labelKey: 'moveNoteDown',
    group: 'navigation',
  },
  {
    id: 'move-note-up',
    keys: ['shift+k'],
    display: 'Shift + k',
    scope: 'grid',
    labelKey: 'moveNoteUp',
    group: 'navigation',
  },
  // Keep also lists n/p + Shift+N/P for list-item navigation, but those only
  // work in an editor with a non-typing "selected item" focus state, which our
  // native-textarea checklist doesn't have — deferred (see docs/PARITY.md).
  // Application
  {
    id: 'compose-note',
    keys: ['c'],
    display: 'c',
    scope: 'base',
    labelKey: 'composeNote',
    group: 'application',
  },
  {
    id: 'compose-list',
    keys: ['l'],
    display: 'l',
    scope: 'base',
    labelKey: 'composeList',
    group: 'application',
  },
  {
    id: 'search',
    keys: ['/'],
    display: '/',
    scope: 'base',
    labelKey: 'search',
    group: 'application',
  },
  {
    id: 'select-all',
    keys: ['mod+a'],
    display: 'Ctrl + a',
    scope: 'grid',
    labelKey: 'selectAll',
    group: 'application',
  },
  {
    id: 'help',
    keys: ['?', 'mod+/'],
    display: '?',
    scope: 'base',
    labelKey: 'help',
    group: 'application',
  },
  {
    id: 'toggle-view',
    keys: ['mod+g'],
    display: 'Ctrl + g',
    scope: 'base',
    labelKey: 'toggleView',
    group: 'application',
  },
  // Actions on the focused/selected note
  {
    id: 'archive',
    keys: ['e'],
    display: 'e',
    scope: 'grid',
    labelKey: 'archiveNote',
    group: 'actions',
  },
  {
    id: 'trash',
    keys: ['#'],
    display: '#',
    scope: 'grid',
    labelKey: 'trashNote',
    group: 'actions',
  },
  {
    id: 'trash-selection',
    keys: ['delete', 'backspace'],
    display: 'Delete',
    scope: 'grid',
    labelKey: 'trashSelection',
    group: 'actions',
  },
  { id: 'pin', keys: ['f'], display: 'f', scope: 'grid', labelKey: 'togglePin', group: 'actions' },
  {
    id: 'select',
    keys: ['x'],
    display: 'x',
    scope: 'grid',
    labelKey: 'selectNote',
    group: 'actions',
  },
  {
    id: 'open',
    keys: ['enter'],
    display: 'Enter',
    scope: 'grid',
    labelKey: 'openNote',
    group: 'actions',
  },
  // Editor
  {
    id: 'close-editor',
    keys: ['escape'],
    display: 'Esc',
    scope: 'editor',
    labelKey: 'closeEditor',
    group: 'editor',
  },
  {
    id: 'save-close-editor',
    keys: ['mod+enter'],
    display: 'Ctrl + Enter',
    scope: 'editor',
    labelKey: 'saveCloseEditor',
    group: 'editor',
  },
  {
    id: 'find-in-note',
    keys: ['mod+f'],
    display: 'Ctrl + f',
    scope: 'editor',
    labelKey: 'findInNote',
    group: 'editor',
  },
  {
    id: 'toggle-checkboxes',
    keys: ['mod+shift+8'],
    display: 'Ctrl + Shift + 8',
    scope: 'editor',
    labelKey: 'toggleCheckboxes',
    group: 'editor',
  },
  {
    id: 'indent-item',
    keys: ['mod+]'],
    display: 'Ctrl + ]',
    scope: 'editor',
    labelKey: 'indentItem',
    group: 'editor',
  },
  {
    id: 'outdent-item',
    keys: ['mod+['],
    display: 'Ctrl + [',
    scope: 'editor',
    labelKey: 'outdentItem',
    group: 'editor',
  },
  {
    id: 'bold',
    keys: ['mod+b'],
    display: 'Ctrl + b',
    scope: 'editor',
    labelKey: 'bold',
    group: 'editor',
  },
  {
    id: 'italic',
    keys: ['mod+i'],
    display: 'Ctrl + i',
    scope: 'editor',
    labelKey: 'italic',
    group: 'editor',
  },
  {
    id: 'underline',
    keys: ['mod+u'],
    display: 'Ctrl + u',
    scope: 'editor',
    labelKey: 'underline',
    group: 'editor',
  },
  // The markdown vocabulary (DECISIONS #26). Display-only entries, like the
  // three above: TipTap owns the keymap, the dialog just makes it findable.
  {
    id: 'strikethrough',
    keys: ['mod+shift+x'],
    display: 'Ctrl + Shift + x',
    scope: 'editor',
    labelKey: 'strikethrough',
    group: 'editor',
  },
  {
    id: 'inline-code',
    keys: ['mod+e'],
    display: 'Ctrl + e',
    scope: 'editor',
    labelKey: 'inlineCode',
    group: 'editor',
  },
  {
    id: 'code-block',
    keys: ['mod+alt+c'],
    display: 'Ctrl + Alt + c',
    scope: 'editor',
    labelKey: 'codeBlock',
    group: 'editor',
  },
  {
    id: 'quote',
    keys: ['mod+shift+b'],
    display: 'Ctrl + Shift + b',
    scope: 'editor',
    labelKey: 'quote',
    group: 'editor',
  },
  {
    id: 'numbered-list',
    keys: ['mod+shift+7'],
    display: 'Ctrl + Shift + 7',
    scope: 'editor',
    labelKey: 'numberedList',
    group: 'editor',
  },
];
