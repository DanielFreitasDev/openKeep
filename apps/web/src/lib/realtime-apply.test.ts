import type { Collaborator, FullNote, WsEnvelope } from '@openkeep/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { notesQuery } from './notes-api.js';
import { sessionQuery } from './queries.js';
import { applyWsEvent } from './realtime-apply.js';

const ME = 'user-me';
const THEM = 'user-them';

function note(overrides: Partial<FullNote> = {}): FullNote {
  const collaborators: Collaborator[] = [
    { userId: 'user-owner', email: 'owner@example.com', name: 'Owner', role: 'owner' },
    { userId: ME, email: 'me@example.com', name: 'Me', role: 'collaborator' },
    { userId: THEM, email: 'them@example.com', name: 'Them', role: 'collaborator' },
  ];
  return {
    id: 'note-1',
    type: 'text',
    title: 'Shared',
    bodyHtml: '',
    hasLinks: false,
    items: [],
    labelIds: [],
    attachments: [],
    reminder: null,
    collaborators,
    role: 'collaborator',
    pinned: false,
    archived: false,
    isTemplate: false,
    color: 'default',
    background: 'none',
    position: 'a0',
    trashedAt: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
    ...overrides,
  };
}

function client(): QueryClient {
  const qc = new QueryClient();
  // The handler reads nothing but `user.id`; the rest of the Better Auth
  // session shape would be noise to construct.
  qc.setQueryData(sessionQuery.queryKey, { user: { id: ME } } as never);
  qc.setQueryData(notesQuery.queryKey, [note()]);
  return qc;
}

const roleChanged = (userId: string, role: 'collaborator' | 'viewer'): WsEnvelope => ({
  type: 'collaborator.role_changed',
  ts: '2026-07-31T00:00:00.000Z',
  payload: { noteId: 'note-1', userId, role },
});

const current = (qc: QueryClient) => qc.getQueryData(notesQuery.queryKey)?.[0] as FullNote;

describe('collaborator.role_changed', () => {
  it('demoting me flips my own role, which is what turns the editor read-only', () => {
    const qc = client();
    expect(applyWsEvent(qc, roleChanged(ME, 'viewer'))).toBe(true);

    const n = current(qc);
    expect(n.role).toBe('viewer');
    expect(n.collaborators.find((c) => c.userId === ME)?.role).toBe('viewer');
  });

  it('demoting someone else redraws the list only — my own access is untouched', () => {
    const qc = client();
    applyWsEvent(qc, roleChanged(THEM, 'viewer'));

    const n = current(qc);
    expect(n.role).toBe('collaborator');
    expect(n.collaborators.find((c) => c.userId === THEM)?.role).toBe('viewer');
    expect(n.collaborators.find((c) => c.userId === ME)?.role).toBe('collaborator');
  });

  it('asks for a refetch when the note is not in the corpus', () => {
    const qc = client();
    qc.setQueryData(notesQuery.queryKey, []);
    expect(applyWsEvent(qc, roleChanged(ME, 'viewer'))).toBe(false);
  });
});
