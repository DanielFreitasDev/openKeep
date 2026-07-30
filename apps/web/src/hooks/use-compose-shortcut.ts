import { useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useCreateAndOpenNote } from './use-create-note.js';

/**
 * Entry point for the installed app's shortcuts (long-press the icon →
 * "New note" / "New list"): `?compose=text|list` creates the note and opens
 * the editor, exactly as the FAB does. The param is dropped by that same
 * navigation, so a reload of the resulting URL never creates a second note.
 *
 * Drawing needs nothing here — `?drawing=new` already opens the canvas and
 * only writes a note once ink is saved.
 */
export function useComposeShortcut(): void {
  const compose = useSearch({ from: '/_shell', select: (s) => s.compose });
  const createNote = useCreateAndOpenNote();
  const handled = useRef(false);

  useEffect(() => {
    if (!compose || handled.current) return;
    handled.current = true;
    createNote(compose);
  }, [compose, createNote]);
}
