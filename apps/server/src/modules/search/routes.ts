import { LIMITS, zFullNote } from '@openkeep/shared';
import { and, eq, exists, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { App } from '../../app.js';
import type { Db } from '../../db/client.js';
import { attachments } from '../../db/schema/attachments.js';
import { labels, noteLabels } from '../../db/schema/labels.js';
import { noteItems, noteMembers, notes } from '../../db/schema/notes.js';
import { reminders } from '../../db/schema/reminders.js';
import { buildPrefixTsquery } from '../../lib/tsquery.js';
import { assembleFullNotes } from '../notes/service.js';

const zSearchQuery = z.object({
  q: z.string().max(500).default(''),
  type: z.enum(['list', 'url', 'image', 'audio', 'drawing', 'reminder']).optional(),
  label: z.string().max(LIMITS.labelNameMax).optional(),
  color: z.string().max(30).optional(),
  /** User id of a collaborator the note is shared with (the "People" filter). */
  collaborator: z.string().max(64).optional(),
});

/**
 * Server-side FTS escape hatch (the primary v1 search UX is client-side over
 * the corpus). Archived included, trashed excluded, ranked, limit 100.
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

      const conditions = [eq(noteMembers.userId, userId), isNull(notes.trashedAt)];

      const tsq = buildPrefixTsquery(q);
      if (tsq) {
        conditions.push(
          sql`(${notes.searchTsv} @@ to_tsquery('openkeep', ${tsq}) OR EXISTS (
            SELECT 1 FROM ${noteItems}
            WHERE ${noteItems.noteId} = ${notes.id}
              AND ${noteItems.searchTsv} @@ to_tsquery('openkeep', ${tsq})
          ))`,
        );
      }

      if (type === 'list') conditions.push(eq(notes.type, 'list'));
      else if (type === 'url') conditions.push(eq(notes.hasLinks, true));
      else if (type === 'image' || type === 'audio' || type === 'drawing') {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(attachments)
              .where(and(eq(attachments.noteId, notes.id), eq(attachments.kind, type))),
          ),
        );
      } else if (type === 'reminder') {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(reminders)
              .where(and(eq(reminders.noteId, notes.id), eq(reminders.userId, userId))),
          ),
        );
      }

      if (color) conditions.push(eq(noteMembers.color, color));

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

      if (label) {
        conditions.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(noteLabels)
              .innerJoin(labels, eq(labels.id, noteLabels.labelId))
              .where(
                and(
                  eq(noteLabels.noteId, notes.id),
                  eq(noteLabels.userId, userId),
                  sql`lower(${labels.name}) = lower(${label})`,
                ),
              ),
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
