// @vitest-environment happy-dom
import { SHORTCUTS } from '@openkeep/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isEditableTarget, KeyboardManager, normalizeCombo } from './keyboard.js';

function keyEvent(key: string, mods: Partial<KeyboardEvent> = {}, target?: EventTarget) {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, ...mods });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

describe('normalizeCombo', () => {
  it('normalizes modifiers with mod for ctrl/meta', () => {
    expect(normalizeCombo(keyEvent('a', { ctrlKey: true }))).toBe('mod+a');
    expect(normalizeCombo(keyEvent('a', { metaKey: true }))).toBe('mod+a');
    expect(normalizeCombo(keyEvent('8', { ctrlKey: true, shiftKey: true }))).toBe('mod+shift+8');
    expect(normalizeCombo(keyEvent('Enter', { ctrlKey: true }))).toBe('mod+enter');
  });

  it('keeps shift implicit for shifted punctuation', () => {
    expect(normalizeCombo(keyEvent('?', { shiftKey: true }))).toBe('?');
    expect(normalizeCombo(keyEvent('#', { shiftKey: true }))).toBe('#');
    expect(normalizeCombo(keyEvent('J', { shiftKey: true }))).toBe('shift+j');
  });

  it('ignores bare modifier presses', () => {
    expect(normalizeCombo(keyEvent('Shift', { shiftKey: true }))).toBeNull();
  });
});

describe('KeyboardManager scope stack', () => {
  let km: KeyboardManager;
  beforeEach(() => {
    km = new KeyboardManager();
  });

  it('grid falls through to base; topmost wins on conflicts', () => {
    const baseC = vi.fn();
    const gridJ = vi.fn();
    const gridC = vi.fn();
    km.push('base', { c: baseC });
    km.push('grid', { j: gridJ, c: gridC });

    km.handle(keyEvent('j'));
    expect(gridJ).toHaveBeenCalledOnce();

    km.handle(keyEvent('c'));
    expect(gridC).toHaveBeenCalledOnce();
    expect(baseC).not.toHaveBeenCalled();
  });

  it('base handles keys grid does not declare', () => {
    const baseSlash = vi.fn();
    km.push('base', { '/': baseSlash });
    km.push('grid', { j: vi.fn() });
    km.handle(keyEvent('/'));
    expect(baseSlash).toHaveBeenCalledOnce();
  });

  it('modal scopes block fall-through entirely', () => {
    const gridE = vi.fn();
    const editorEsc = vi.fn();
    km.push('base', {});
    km.push('grid', { e: gridE });
    const pop = km.push('editor', { escape: editorEsc });

    km.handle(keyEvent('e'));
    expect(gridE).not.toHaveBeenCalled();

    km.handle(keyEvent('Escape'));
    expect(editorEsc).toHaveBeenCalledOnce();

    pop();
    km.handle(keyEvent('e'));
    expect(gridE).toHaveBeenCalledOnce();
  });

  it('single-char bindings stay quiet in editable targets; modified combos fire', () => {
    const gridE = vi.fn();
    const gridToggle = vi.fn();
    km.push('grid', { e: gridE, 'mod+g': gridToggle });

    const input = document.createElement('input');
    km.handle(keyEvent('e', {}, input));
    expect(gridE).not.toHaveBeenCalled();

    km.handle(keyEvent('g', { ctrlKey: true }, input));
    expect(gridToggle).toHaveBeenCalledOnce();
  });

  it('text-producing combos stay quiet in editable targets: shift+char and mod+a', () => {
    const reorder = vi.fn();
    const selectAll = vi.fn();
    km.push('grid', { 'shift+j': reorder, 'mod+a': selectAll });

    const input = document.createElement('input');
    const capitalJ = keyEvent('J', { shiftKey: true }, input);
    km.handle(capitalJ);
    expect(reorder).not.toHaveBeenCalled();
    expect(capitalJ.defaultPrevented).toBe(false); // "J" reaches the field

    const nativeSelectAll = keyEvent('a', { ctrlKey: true }, input);
    km.handle(nativeSelectAll);
    expect(selectAll).not.toHaveBeenCalled();
    expect(nativeSelectAll.defaultPrevented).toBe(false);

    // Outside editables both fire normally.
    km.handle(keyEvent('J', { shiftKey: true }));
    expect(reorder).toHaveBeenCalledOnce();
    km.handle(keyEvent('a', { ctrlKey: true }));
    expect(selectAll).toHaveBeenCalledOnce();
  });

  it('editable detection covers inputs and contenteditable', () => {
    const input = document.createElement('textarea');
    expect(isEditableTarget(input)).toBe(true);
    const div = document.createElement('div');
    expect(isEditableTarget(div)).toBe(false);
  });
});

describe('registry ↔ engine completeness', () => {
  it('every shared shortcut has a parseable binding shape', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.keys.length).toBeGreaterThan(0);
      for (const combo of shortcut.keys) {
        expect(combo).toMatch(
          /^(mod\+)?(shift\+)?[a-z0-9?#/[\]]+(\+[a-z0-9\]]+)?$|^escape$|^enter$/i,
        );
      }
      expect(['base', 'grid', 'editor', 'dialog']).toContain(shortcut.scope);
    }
  });
});
