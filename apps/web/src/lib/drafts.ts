import type { CreateNote, InviteRole, SetReminder } from '@openkeep/shared';

/**
 * Best-effort localStorage mirror of unsaved edits. Delivery belongs to the
 * mutation layer (and, when persisted, its outbox); the mirror only
 * guarantees the content survives a reload that outruns it — a failed
 * request, or a reload before a paused mutation reaches storage. Entries
 * clear on server ack and expire after 7 days.
 */

const NOTE_PREFIX = 'openkeep:draft:note:';
const COMPOSER_KEY = 'openkeep:draft:composer';
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

interface DraftField {
  value: string;
  /** Client clock at the last keystroke — compared against the ack/send time. */
  at: number;
}

export interface DraftItemRow {
  id: string | null;
  /** Client row key — doubles as a provisional item id when painting uncreated rows. */
  key: string;
  text: string;
  checked: boolean;
  indent: 0 | 1;
  position: string;
}

export interface NoteDraft {
  fields: Partial<Record<'title' | 'bodyHtml', DraftField>>;
  items?: { rows: DraftItemRow[]; at: number };
  savedAt: number;
}

/** An invitation collected before the note exists. */
export interface DraftInvite {
  email: string;
  role: InviteRole;
}

export interface ComposerDraft {
  note: CreateNote & { id: string };
  labelIds: string[];
  reminder: SetReminder | null;
  invites: DraftInvite[];
  savedAt: number;
}

let warned = false;

function safeSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn('draft mirror write failed', err);
    }
  }
}

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

export function readNoteDraft(noteId: string): NoteDraft | null {
  const draft = safeRead<NoteDraft>(NOTE_PREFIX + noteId);
  if (!draft || typeof draft.savedAt !== 'number' || typeof draft.fields !== 'object') return null;
  if (Date.now() - draft.savedAt > MAX_AGE_MS) {
    removeNoteDraft(noteId);
    return null;
  }
  return draft;
}

export function saveNoteDraftFields(noteId: string, patch: Record<string, unknown>) {
  const now = Date.now();
  const draft: NoteDraft = readNoteDraft(noteId) ?? { fields: {}, savedAt: now };
  for (const field of ['title', 'bodyHtml'] as const) {
    const value = patch[field];
    if (typeof value === 'string') draft.fields[field] = { value, at: now };
  }
  draft.savedAt = now;
  safeSet(NOTE_PREFIX + noteId, draft);
}

export function saveNoteDraftItems(noteId: string, rows: DraftItemRow[]) {
  const now = Date.now();
  const draft: NoteDraft = readNoteDraft(noteId) ?? { fields: {}, savedAt: now };
  draft.items = { rows, at: now };
  draft.savedAt = now;
  safeSet(NOTE_PREFIX + noteId, draft);
}

/**
 * Drop mirrored fields the server acked. A field typed again after the send
 * (`at > sentAt` and a different value) stays — it is still unsaved.
 */
export function clearAckedDraftFields(
  noteId: string,
  patch: Record<string, unknown>,
  sentAt: number,
) {
  const draft = readNoteDraft(noteId);
  if (!draft) return;
  for (const field of ['title', 'bodyHtml'] as const) {
    const entry = draft.fields[field];
    if (!entry || !(field in patch)) continue;
    if (entry.value === patch[field] || entry.at <= sentAt) delete draft.fields[field];
  }
  persistOrDrop(noteId, draft);
}

export function clearDraftItems(noteId: string) {
  const draft = readNoteDraft(noteId);
  if (!draft) return;
  draft.items = undefined;
  persistOrDrop(noteId, draft);
}

function persistOrDrop(noteId: string, draft: NoteDraft) {
  if (Object.keys(draft.fields).length === 0 && !draft.items) removeNoteDraft(noteId);
  else safeSet(NOTE_PREFIX + noteId, draft);
}

export function removeNoteDraft(noteId: string) {
  safeRemove(NOTE_PREFIX + noteId);
}

export function listNoteDraftIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(NOTE_PREFIX)) ids.push(key.slice(NOTE_PREFIX.length));
    }
  } catch {
    // best-effort
  }
  return ids;
}

// ------------------------------------------------------------- composer

export function readComposerDraft(): ComposerDraft | null {
  const draft = safeRead<ComposerDraft>(COMPOSER_KEY);
  if (!draft || typeof draft.savedAt !== 'number' || !draft.note?.id) return null;
  if (Date.now() - draft.savedAt > MAX_AGE_MS) {
    clearComposerDraft();
    return null;
  }
  // Mirrors written before view-only sharing stored bare emails, which meant
  // "can edit" — a reload must not drop the invitations already collected.
  const invites = (draft.invites ?? []).map((i) =>
    typeof i === 'string' ? { email: i, role: 'collaborator' as const } : i,
  );
  return { ...draft, invites };
}

export function saveComposerDraft(draft: Omit<ComposerDraft, 'savedAt'>) {
  safeSet(COMPOSER_KEY, { ...draft, savedAt: Date.now() });
}

export function clearComposerDraft() {
  safeRemove(COMPOSER_KEY);
}

/** Ack path: the composer draft is delivered once its note exists server-side. */
export function clearComposerDraftIfNote(noteId: string) {
  if (safeRead<ComposerDraft>(COMPOSER_KEY)?.note?.id === noteId) clearComposerDraft();
}
