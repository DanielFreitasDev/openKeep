import { markdownToHtml, plainTextToHtml } from '@openkeep/shared';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useCreateAndOpenNote } from '../../hooks/use-create-note.js';
import { sharedToNote, takeSharedPayload } from '../../lib/share-target.js';

export const Route = createFileRoute('/_shell/share')({
  component: ShareTarget,
});

/**
 * Landing route of the PWA share target. The service worker has already
 * stashed what the system share sheet POSTed; this only drains it into a new
 * note and hands over to the editor. Sitting under `_shell` means a share that
 * arrives logged out goes through the normal login redirect and comes back —
 * the payload waits in the cache.
 *
 * Renders nothing: the redirect happens on the first effect, so a frame of
 * empty board beats a spinner that would flash for the same instant.
 */
function ShareTarget() {
  const navigate = useNavigate();
  const createNote = useCreateAndOpenNote();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void (async () => {
      const shared = await takeSharedPayload().catch(() => null);
      // Nothing to consume: a bookmarked /share, or a reload after the note
      // was already created. Either way the board is where the user belongs.
      if (!shared) {
        void navigate({ to: '/', replace: true });
        return;
      }
      const { title, body } = sharedToNote(shared.payload);
      // Shared text is often markdown (a README, a chat message, a snippet
      // from another notes app); it lands formatted, exactly as if pasted.
      createNote('text', {
        title: title.slice(0, 999),
        bodyHtml: body ? (markdownToHtml(body) ?? plainTextToHtml(body)) : '',
        files: shared.files,
        to: '/',
        replace: true,
      });
    })();
  }, [navigate, createNote]);

  return null;
}
