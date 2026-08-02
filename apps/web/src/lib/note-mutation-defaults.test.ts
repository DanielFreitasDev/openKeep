// @vitest-environment happy-dom
import type { NoteContentResult, PatchNoteContent } from '@openkeep/shared';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noteMutationKeys, registerNoteMutationDefaults } from './note-mutation-defaults.js';

vi.mock('./notes-api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notes-api.js')>()),
  patchNoteContent: vi.fn(),
}));

const { patchNoteContent } = await import('./notes-api.js');

/**
 * The outbox drains concurrently — React Query resumes every paused mutation
 * at once — so ordering has to come from the mutation function itself.
 */
describe('writes to one note', () => {
  let queryClient: QueryClient;
  let started: string[];
  let release: Array<() => void>;

  const patch = (id: string, bodyHtml: string) =>
    new MutationObserver<NoteContentResult, Error, { id: string; patch: PatchNoteContent }>(
      queryClient,
      { mutationKey: [...noteMutationKeys.patchContent] },
    )
      .mutate({ id, patch: { bodyHtml } })
      .catch(() => undefined);

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    registerNoteMutationDefaults(queryClient);
    started = [];
    release = [];
    vi.mocked(patchNoteContent).mockImplementation((id, body) => {
      const bodyHtml = body.bodyHtml ?? '';
      started.push(bodyHtml);
      return new Promise((resolve) => {
        release.push(() =>
          resolve({ id, title: '', bodyHtml, hasLinks: false, updatedAt: '2026-08-02T00:00:00Z' }),
        );
      });
    });
  });

  // The chain is module state keyed by note id, so each test uses its own id
  // rather than leaving a queue behind for the next one.
  it('leave one at a time, in the order they were made', async () => {
    void patch('ordered', '<p>first</p>');
    void patch('ordered', '<p>first typed offline</p>');

    await vi.waitFor(() => expect(started).toHaveLength(1));
    // The second is held back rather than racing the first: whichever lands
    // last is what the server keeps, and that must be the later edit.
    expect(started).toEqual(['<p>first</p>']);

    release[0]?.();
    await vi.waitFor(() => expect(started).toEqual(['<p>first</p>', '<p>first typed offline</p>']));
    release[1]?.();
  });

  it('do not hold up a different note', async () => {
    void patch('slow-note', '<p>slow</p>');
    void patch('other-note', '<p>other</p>');
    await vi.waitFor(() => expect([...started].sort()).toEqual(['<p>other</p>', '<p>slow</p>']));
    for (const r of release) r();
  });

  it('keep flowing after one of them fails', async () => {
    vi.mocked(patchNoteContent).mockRejectedValueOnce(new Error('offline'));
    void patch('failing', '<p>failed</p>');
    void patch('failing', '<p>after the failure</p>');
    // The rejected call never records, so seeing the next one prove the queue
    // did not stall behind it is the whole assertion.
    await vi.waitFor(() => expect(started).toEqual(['<p>after the failure</p>']));
    for (const r of release) r();
  });
});
