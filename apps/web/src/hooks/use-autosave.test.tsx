// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './use-autosave.js';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces and merges dirty fields into one save', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useAutosave(save, 500));

    act(() => {
      result.current.markDirty('title', 'a');
      result.current.markDirty('bodyHtml', '<p>b</p>');
      result.current.markDirty('title', 'ab');
    });
    expect(save).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(save).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ title: 'ab', bodyHtml: '<p>b</p>' });
  });

  it('restarts the trailing window on each keystroke', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useAutosave(save, 500));

    act(() => result.current.markDirty('title', 'a'));
    act(() => vi.advanceTimersByTime(400));
    act(() => result.current.markDirty('title', 'ab'));
    act(() => vi.advanceTimersByTime(400));
    expect(save).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(save).toHaveBeenCalledWith({ title: 'ab' });
  });

  it('flush() saves immediately and clears the dirty map', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useAutosave(save, 500));
    act(() => {
      result.current.markDirty('title', 'x');
      result.current.flush();
    });
    expect(save).toHaveBeenCalledWith({ title: 'x' });
    expect(result.current.isDirty()).toBe(false);

    act(() => vi.advanceTimersByTime(1000));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flushes on unmount', () => {
    const save = vi.fn();
    const { result, unmount } = renderHook(() => useAutosave(save, 500));
    act(() => result.current.markDirty('title', 'bye'));
    unmount();
    expect(save).toHaveBeenCalledWith({ title: 'bye' });
  });

  it('tracks per-field dirtiness for the anti-stomp guard', () => {
    const save = vi.fn();
    const { result } = renderHook(() => useAutosave(save, 500));
    act(() => result.current.markDirty('title', 'x'));
    expect(result.current.isDirty('title')).toBe(true);
    expect(result.current.isDirty('bodyHtml')).toBe(false);
  });

  describe('the value the server already has', () => {
    const committed = () => ({ title: 'stored', bodyHtml: '<p>stored</p>' });

    it('is not an edit, so nothing is queued', () => {
      const save = vi.fn();
      const { result } = renderHook(() =>
        useAutosave(save, 500, undefined, (f) => committed()[f as 'title']),
      );
      act(() => result.current.markDirty('bodyHtml', '<p>stored</p>'));
      expect(result.current.isDirty('bodyHtml')).toBe(false);
      act(() => vi.advanceTimersByTime(1000));
      expect(save).not.toHaveBeenCalled();
    });

    it('still lets a real change through', () => {
      const save = vi.fn();
      const { result } = renderHook(() =>
        useAutosave(save, 500, undefined, (f) => committed()[f as 'title']),
      );
      act(() => result.current.markDirty('title', 'typed'));
      act(() => vi.advanceTimersByTime(500));
      expect(save).toHaveBeenCalledWith({ title: 'typed' });
    });

    it('does not silence a field that is already dirty', () => {
      const save = vi.fn();
      const { result } = renderHook(() =>
        useAutosave(save, 500, undefined, (f) => committed()[f as 'title']),
      );
      // Typed away and then back again: the pending value has to be replaced,
      // or the queue would keep an edit the user has undone.
      act(() => result.current.markDirty('title', 'typed'));
      act(() => result.current.markDirty('title', 'stored'));
      act(() => vi.advanceTimersByTime(500));
      expect(save).toHaveBeenCalledWith({ title: 'stored' });
    });
  });
});
