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
  {
    id: 'nav-next-item',
    keys: ['n'],
    display: 'n',
    scope: 'editor',
    labelKey: 'navNextItem',
    group: 'navigation',
  },
  {
    id: 'nav-prev-item',
    keys: ['p'],
    display: 'p',
    scope: 'editor',
    labelKey: 'navPrevItem',
    group: 'navigation',
  },
  {
    id: 'move-item-down',
    keys: ['shift+n'],
    display: 'Shift + n',
    scope: 'editor',
    labelKey: 'moveItemDown',
    group: 'navigation',
  },
  {
    id: 'move-item-up',
    keys: ['shift+p'],
    display: 'Shift + p',
    scope: 'editor',
    labelKey: 'moveItemUp',
    group: 'navigation',
  },
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
];
