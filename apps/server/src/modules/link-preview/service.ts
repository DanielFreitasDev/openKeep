import { createHash } from 'node:crypto';
import type { LinkPreview } from '@openkeep/shared';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { linkPreviews } from '../../db/schema/attachments.js';
import type { FetchedPreview } from './fetcher.js';

const OK_TTL_MS = 7 * 24 * 3600 * 1000;
const FAILED_TTL_MS = 24 * 3600 * 1000;

export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = '';
  return url.toString();
}

export function urlHashOf(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

type PreviewRow = typeof linkPreviews.$inferSelect;

function toDto(row: PreviewRow): LinkPreview {
  return {
    url: row.url,
    status: row.status as LinkPreview['status'],
    title: row.title,
    description: row.description,
    siteName: row.siteName,
    faviconUrl: row.faviconUrl,
    imageUrl: row.imageUrl,
  };
}

/**
 * Cache lookup. Returns fresh entries; (re)marks pending + asks the caller to
 * enqueue a fetch when missing or expired.
 */
export async function getOrQueue(
  db: Db,
  rawUrl: string,
): Promise<{ preview: LinkPreview; enqueue: string | null }> {
  const normalized = normalizeUrl(rawUrl);
  const hash = urlHashOf(normalized);
  const [row] = await db.select().from(linkPreviews).where(eq(linkPreviews.urlHash, hash)).limit(1);

  const now = Date.now();
  if (row && row.status !== 'pending' && row.expiresAt && row.expiresAt.getTime() > now) {
    return { preview: toDto(row), enqueue: null };
  }
  if (row?.status === 'pending') {
    return { preview: toDto(row), enqueue: null };
  }

  await db
    .insert(linkPreviews)
    .values({ urlHash: hash, url: normalized, status: 'pending' })
    .onConflictDoUpdate({ target: linkPreviews.urlHash, set: { status: 'pending' } });
  return {
    preview: {
      url: normalized,
      status: 'pending',
      title: null,
      description: null,
      siteName: null,
      faviconUrl: null,
      imageUrl: null,
    },
    enqueue: normalized,
  };
}

export async function storeFetched(
  db: Db,
  normalizedUrl: string,
  result: FetchedPreview,
): Promise<void> {
  const hash = urlHashOf(normalizedUrl);
  const now = new Date();
  const expires = new Date(now.getTime() + (result.ok ? OK_TTL_MS : FAILED_TTL_MS));
  await db
    .insert(linkPreviews)
    .values({
      urlHash: hash,
      url: normalizedUrl,
      status: result.ok ? 'ok' : 'failed',
      title: result.title ?? null,
      description: result.description ?? null,
      siteName: result.siteName ?? null,
      faviconUrl: result.faviconUrl ?? null,
      imageUrl: result.imageUrl ?? null,
      fetchedAt: now,
      expiresAt: expires,
    })
    .onConflictDoUpdate({
      target: linkPreviews.urlHash,
      set: {
        status: result.ok ? 'ok' : 'failed',
        title: result.title ?? null,
        description: result.description ?? null,
        siteName: result.siteName ?? null,
        faviconUrl: result.faviconUrl ?? null,
        imageUrl: result.imageUrl ?? null,
        fetchedAt: now,
        expiresAt: expires,
      },
    });
}

export async function pruneExpiredPreviews(db: Db, now = new Date()): Promise<number> {
  const gone = await db
    .delete(linkPreviews)
    .where(lt(linkPreviews.expiresAt, new Date(now.getTime() - 24 * 3600 * 1000)))
    .returning({ urlHash: linkPreviews.urlHash });
  return gone.length;
}
