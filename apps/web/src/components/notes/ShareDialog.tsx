import { Dialog } from '@base-ui/react/dialog';
import type { Collaborator, FullNote } from '@openkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCollaboratorMutations } from '../../hooks/use-collaborator-mutations.js';
import { sessionQuery } from '../../lib/queries.js';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborators: Collaborator[];
  isOwner: boolean;
  inviting?: boolean;
  onInvite: (email: string) => void;
  onRemove: (userId: string) => void;
}

/**
 * Keep's Collaborators dialog: single permission level, owner manages.
 * Controlled, so the composer can collect collaborators before the note exists.
 */
export function ShareDialog({
  open,
  onOpenChange,
  collaborators,
  isOwner,
  inviting = false,
  onInvite,
  onRemove,
}: ShareDialogProps) {
  const { t } = useTranslation('sharing');
  const { data: session } = useQuery(sessionQuery);
  const [email, setEmail] = useState('');
  const myId = session?.user.id;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--scrim)" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[70vh] w-[min(92vw,440px)] flex-col rounded-lg bg-surface shadow-(--elevation-3)">
          <Dialog.Title className="px-6 pt-5 pb-2 font-medium text-lg text-on-surface">
            {t('title')}
          </Dialog.Title>

          <div className="flex-1 overflow-y-auto px-4 pb-2">
            {collaborators.map((c) => (
              <div key={c.userId} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary font-medium text-on-primary text-sm">
                  {(c.name || c.email).charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-on-surface text-sm">
                    {c.name}
                    {c.userId === myId && ` (${t('you')})`}
                  </span>
                  <span className="block truncate text-on-surface-variant text-xs">
                    {c.role === 'owner' ? t('ownerBadge') : c.email}
                  </span>
                </span>
                {c.role !== 'owner' && (isOwner || c.userId === myId) && (
                  <button
                    type="button"
                    className="rounded px-2 py-1 font-medium text-primary text-xs hover:bg-(--surface-hover)"
                    onClick={() => onRemove(c.userId)}
                  >
                    {c.userId === myId ? t('leave') : t('remove')}
                  </button>
                )}
              </div>
            ))}

            {isOwner && (
              <form
                className="mt-2 flex items-center gap-2 px-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) {
                    onInvite(email.trim());
                    setEmail('');
                  }
                }}
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  aria-label={t('emailPlaceholder')}
                  className="h-10 w-full border-(--outline-variant) border-b bg-transparent text-on-surface text-sm outline-none focus:border-(--primary)"
                />
                <button
                  type="submit"
                  disabled={inviting || email.trim() === ''}
                  className="rounded px-3 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover) disabled:opacity-40"
                >
                  {t('invite')}
                </button>
              </form>
            )}
          </div>

          <div className="flex justify-end px-4 pb-4">
            <Dialog.Close className="rounded px-4 py-2 font-medium text-primary text-sm hover:bg-(--surface-hover)">
              {t('common:done')}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The dialog wired to a persisted note's collaborator mutations. */
export function NoteShareDialog({
  note,
  open,
  onOpenChange,
}: {
  note: FullNote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const m = useCollaboratorMutations();
  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      collaborators={note.collaborators}
      isOwner={note.role === 'owner'}
      inviting={m.invite.isPending}
      onInvite={(email) => m.invite.mutate({ noteId: note.id, email })}
      onRemove={(userId) =>
        m.remove.mutate({ noteId: note.id, userId, onLeft: () => onOpenChange(false) })
      }
    />
  );
}
