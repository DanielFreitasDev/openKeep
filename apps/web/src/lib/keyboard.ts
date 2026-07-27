/**
 * Scope-stack keyboard manager (Keep's model).
 * - One capture-phase listener; scopes stack: base < grid < editor < dialog.
 * - Inside editable targets, combos that produce or edit text (bare chars,
 *   shift+char, mod+a) never fire bindings — typing always wins.
 * - Modal scopes (editor/dialog) block fall-through; grid falls through to base.
 * - The registry lives in @openkeep/shared SHORTCUTS — single source for the
 *   engine and the "?" help dialog.
 */

export type KeyScope = 'base' | 'grid' | 'editor' | 'dialog';

const MODAL_SCOPES: ReadonlySet<KeyScope> = new Set(['editor', 'dialog']);
const SCOPE_RANK: Record<KeyScope, number> = { base: 0, grid: 1, editor: 2, dialog: 3 };

export type KeyHandler = (event: KeyboardEvent) => void;
export interface ScopeEntry {
  scope: KeyScope;
  bindings: Map<string, KeyHandler>;
}

export function normalizeCombo(event: KeyboardEvent): string | null {
  const key = event.key;
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  const lower = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  // Shift is implicit for printable characters ('?', '#'); explicit otherwise.
  if (event.shiftKey && (key.length > 1 || /^[a-z0-9]$/i.test(key))) parts.push('shift');
  const name = lower === ' ' ? 'space' : lower === 'esc' ? 'escape' : lower;
  parts.push(name);
  return parts.join('+');
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class KeyboardManager {
  private stack: ScopeEntry[] = [];
  private listener = (event: KeyboardEvent) => this.handle(event);
  private attached = false;

  attach(): void {
    if (this.attached) return;
    document.addEventListener('keydown', this.listener, { capture: true });
    this.attached = true;
  }

  detach(): void {
    document.removeEventListener('keydown', this.listener, { capture: true });
    this.attached = false;
  }

  push(scope: KeyScope, bindings: Record<string, KeyHandler>): () => void {
    const entry: ScopeEntry = { scope, bindings: new Map(Object.entries(bindings)) };
    this.stack.push(entry);
    this.sort();
    return () => {
      this.stack = this.stack.filter((e) => e !== entry);
    };
  }

  private sort(): void {
    this.stack.sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]);
  }

  activeScopes(): KeyScope[] {
    return this.stack.map((e) => e.scope);
  }

  handle(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    const combo = normalizeCombo(event);
    if (!combo) return;

    // While typing, anything that produces a character (bare keys like `j`,
    // shifted letters like `shift+j` = "J") or edits text natively (mod+a =
    // select all) must reach the field untouched.
    if (isEditableTarget(event.target)) {
      const producesText = !combo.includes('mod+') && !combo.includes('alt+');
      if (producesText || combo === 'mod+a') return;
    }

    for (let i = this.stack.length - 1; i >= 0; i--) {
      const entry = this.stack[i]!;
      const handler = entry.bindings.get(combo);
      if (handler) {
        event.preventDefault();
        handler(event);
        return;
      }
      // Keep blocks grid/base keys entirely while a modal is open.
      if (MODAL_SCOPES.has(entry.scope)) {
        return;
      }
    }
  }
}

export const keyboard = new KeyboardManager();
