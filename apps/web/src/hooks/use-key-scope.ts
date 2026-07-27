import { useEffect } from 'react';
import type { KeyHandler, KeyScope } from '../lib/keyboard.js';
import { keyboard } from '../lib/keyboard.js';

/** Registers a keyboard scope for the component's lifetime. */
export function useKeyScope(
  scope: KeyScope,
  bindings: Record<string, KeyHandler>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    keyboard.attach();
    return keyboard.push(scope, bindings);
    // Bindings are intentionally captured per mount; callers pass stable fns
    // or accept re-registration via the deps they change.
  }, [scope, enabled, bindings]);
}
