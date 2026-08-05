import {
  findLabelByPath,
  LIMITS,
  labelSubtreeIds,
  parseSearchQuery,
  SEARCH_TYPES,
  type SearchType,
  zFullNote,
} from '@openkeep/shared';
import { and, eq, exists, inArray, isNull, not, notInArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { attachments } from '../../db/schema/attachments.js';
import { labels, noteLabels } from '../../db/schema/labels.js';
import { noteItems, noteMembers, notes } from '../../db/schema/notes.js';
import { reminders } from '../../db/schema/reminders.js';
import { requestIsRevealed } from '../../lib/note-protection.js';
import { buildPrefixTsquery } from '../../lib/tsquery.js';
import { assembleFullNotes } from '../notes/service.js';

const zSearchQuery = z.object({
  q: z
    .string()
    .max(500)
    .default('')
    .describe(
      'Search terms (prefix matching). Supports operators: label:path, color:blue, has:image, ' +
        'is:pinned|unpinned|archived|unarchived, before:/after:YYYY-MM-DD, and - to exclude ' +
        '(-word, -label:work). Quote values with spaces: label:"to do". A label path may be ' +
        'nested (label:"Work/Clients") and always matches the sub-labels under it.',
    ),
  type: z.enum(SEARCH_TYPES).optional(),
  label: z.string().max(LIMITS.labelPathMax).optional(),
  color: z.string().max(30).optional(),
  /** User id of a collaborator the note is shared with (the "People" filter). */
  collaborator: z.string().max(64).optional(),
});

/**
 * Server-side FTS escape hatch (the primary v1 search UX is client-side over
 * the corpus). Archived included, trashed and templates excluded, ranked,
 * limit 100.
 */
export function registerSearchRoutes(app: App, db: Db): void {
  app.get(
    '/api/search',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['search'],
        querystring: zSearchQuery,
        response: { 200: z.array(zFullNote.extend({ headline: z.string().nullable() })) },
      },
    },
    async (req) => {
      const { q, type, label, color, collaborator } = req.query;
      const userId = req.user.id;

      // The operators travel inside `q` rather than as extra query params:
      // one query language, parsed by the same code the browser runs, so an
      // agent and a person typing the same string get the same notes.
      const query = parseSearchQuery(q);

      // Templates are excluded like the trash is: they are starting shapes
      // kept out of the board, not notes one expects to find by searching.
      const conditions = [
        eq(noteMembers.userId, userId),
        isNull(notes.trashedAt),
        eq(noteMembers.isTemplate, false),
      ];

      // A protected note is not merely redacted in the results — it is not a
      // result. Leaving the empty card in would answer the question the lock
      // exists to refuse: whether a note about *that* exists at all.
      if (!requestIsRevealed()) conditions.push(eq(noteMembers.locked, false));

      /** Note-or-item text match, which is what "the note contains it" means. */
      const textMatches = (tsquery: string) =>
        sql`(${notes.searchTsv} @@ to_tsquery('openkeep', ${tsquery}) OR EXISTS (
            SELECT 1 FROM ${noteItems}
            WHERE ${noteItems.noteId} = ${notes.id}
              AND ${noteItems.searchTsv} @@ to_tsquery('openkeep', ${tsquery})
          ))`;

      const tsq = buildPrefixTsquery(query.text.join(' '));
      if (tsq) conditions.push(textMatches(tsq));

      const excludedTsq = buildPrefixTsquery(query.exclude.join(' '), '|');
      if (excludedTsq) conditions.push(sql`NOT ${textMatches(excludedTsq)}`);

      const hasKind = (kind: SearchType): SQL => {
        if (kind === 'list') return eq(notes.type, 'list');
        if (kind === 'url') return eq(notes.hasLinks, true);
        if (kind === 'reminder') {
          return exists(
            db
              .select({ one: sql`1` })
              .from(reminders)
              .where(and(eq(reminders.noteId, notes.id), eq(reminders.userId, userId))),
          );
        }
        return exists(
          db
            .select({ one: sql`1` })
            .from(attachments)
            .where(and(eq(attachments.noteId, notes.id), eq(attachments.kind, kind))),
        );
      };

      /**
       * `label:Work/Clients` is a path now, and it matches the subtree — a
       * folder answers for what is filed under it. Resolution happens in JS
       * against the account's 50-label ceiling rather than in SQL, so the
       * server and the browser agree on what a path means down to the
       * unique-bare-name fallback. A path nobody has resolves to no ids, which
       * `inArray` renders as "matches nothing" — the honest answer for a typo.
       */
      const labelPaths = [...(label ? [label] : []), ...query.labels, ...query.notLabels];
      const idsByPath = new Map<string, string[]>();
      if (labelPaths.length > 0) {
        const mine = (
          await db
            .select({
              id: labels.id,
              name: labels.name,
              parentId: labels.parentId,
              position: labels.position,
            })
            .from(labels)
            .where(eq(labels.userId, userId))
        ).map((l) => ({ ...l, parentId: l.parentId }));
        for (const path of labelPaths) {
          const found = findLabelByPath(mine, path);
          idsByPath.set(path, found ? labelSubtreeIds(mine, found.id) : []);
        }
      }

      const hasLabel = (path: string): SQL => {
        const ids = idsByPath.get(path) ?? [];
        if (ids.length === 0) return sql`false`;
        return exists(
          db
            .select({ one: sql`1` })
            .from(noteLabels)
            .where(
              and(
                eq(noteLabels.noteId, notes.id),
                eq(noteLabels.userId, userId),
                inArray(noteLabels.labelId, ids),
              ),
            ),
        );
      };

      // The `type=`/`label=`/`color=` params are the tile chips; they AND with
      // whatever the query string itself asked for.
      for (const kind of [...(type ? [type] : []), ...query.has]) conditions.push(hasKind(kind));
      for (const kind of query.notHas) conditions.push(not(hasKind(kind)));

      for (const path of [...(label ? [label] : []), ...query.labels]) {
        conditions.push(hasLabel(path));
      }
      for (const path of query.notLabels) conditions.push(not(hasLabel(path)));

      if (color) conditions.push(eq(noteMembers.color, color));
      if (query.colors.length > 0) conditions.push(inArray(noteMembers.color, query.colors));
      if (query.notColors.length > 0)
        conditions.push(notInArray(noteMembers.color, query.notColors));

      if (query.pinned !== undefined) conditions.push(eq(noteMembers.pinned, query.pinned));
      if (query.archived !== undefined) conditions.push(eq(noteMembers.archived, query.archived));

      // UTC day boundaries, spelled out with the Z: the client compares the
      // same ISO prefix, and the server's own timezone never enters into it.
      if (query.before) {
        conditions.push(sql`${notes.updatedAt} < ${`${query.before}T00:00:00Z`}::timestamptz`);
      }
      if (query.after) {
        conditions.push(sql`${notes.updatedAt} >= ${`${query.after}T00:00:00Z`}::timestamptz`);
      }

      if (collaborator) {
        // Self-join on note_members: the outer row is my membership, this one
        // is theirs, so the note is one we both hold.
        const shared = alias(noteMembers, 'shared_with');
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(shared)
              .where(and(eq(shared.noteId, notes.id), eq(shared.userId, collaborator))),
          ),
        );
      }

      const base = db
        .select({
          member: noteMembers,
          note: notes,
          headline: tsq
            ? sql<
                string | null
              >`ts_headline('openkeep', ${notes.bodyText}, to_tsquery('openkeep', ${tsq}), 'MaxFragments=1, MaxWords=18, MinWords=6')`
            : sql<string | null>`NULL`,
        })
        .from(noteMembers)
        .innerJoin(notes, eq(notes.id, noteMembers.noteId))
        .where(and(...conditions))
        .limit(100);

      const rows = tsq
        ? await base.orderBy(
            sql`ts_rank(${notes.searchTsv}, to_tsquery('openkeep', ${tsq})) DESC`,
            notes.updatedAt,
          )
        : await base.orderBy(sql`${notes.updatedAt} DESC`);

      const headlines = new Map(rows.map((r) => [r.note.id, r.headline]));
      const assembled = await assembleFullNotes(db, userId, rows);
      return assembled.map((n) => ({ ...n, headline: headlines.get(n.id) ?? null }));
    },
  );
}
