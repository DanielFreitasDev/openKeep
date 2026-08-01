import { Dialog } from '@base-ui/react/dialog';
import type { FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNoteFromTemplate } from '../../hooks/use-create-note.js';
import { selectTemplates } from '../../lib/note-selectors.js';
import { notesQuery } from '../../lib/notes-api.js';
import { noteLinkLabel } from './NotePicker.js';

/**
 * "Start from a template": which shape to begin with.
 *
 * A dialog rather than a popover because it is opened from two places that
 * could not share one anchor — the composer's toolbar on the desktop and the
 * FAB's sheet on mobile — and picking one is a decision, not a toggle.
 *
 * Rows are labelled the way the `[[` picker labels notes: the title, or the
 * first thing the note says when it has none. Ordered by recency for the same
 * reason too — the template you reach for is usually the one you last touched
 * — and browsing the whole shelf is what the Templates view is for.
 */
export function TemplatePickerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('notes');
  const select = useCallback((notes: FullNote[]) => selectTemplates(notes, 'edited'), []);
  const { data: templates } = useQuery({ ...notesQuery, select });
  const noteFromTemplate = useNoteFromTemplate();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[80vh] w-[min(90vw,380px)] flex-col rounded-lg bg-surface py-4 shadow-(--elevation-3)">
          <Dialog.Title className="px-6 pb-2 font-medium text-lg text-on-surface">
            {t('newFromTemplate')}
          </Dialog.Title>
          <div className="overflow-y-auto">
            {(templates ?? []).map((template) => (
              <button
                key={template.id}
                type="button"
                className="block w-full truncate px-6 py-2.5 text-left text-on-surface text-sm hover:bg-(--surface-hover)"
                onClick={() => {
                  onOpenChange(false);
                  noteFromTemplate(template.id);
                }}
              >
                {noteLinkLabel(template, t('untitledTemplate'))}
              </button>
            ))}
          </div>
          <div className="flex justify-end px-4 pt-2">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:cancel')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
