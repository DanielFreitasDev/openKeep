/**
 * PWA Share Target hand-off.
 *
 * The system share sheet POSTs multipart form data to `/share`, which no
 * navigation can carry into the SPA. The service worker therefore drains the
 * request into the Cache API and 303s to a plain `GET /share`, where the app
 * picks the payload back up. Cache — not IndexedDB or postMessage — because
 * both sides already speak it, it holds `Blob`s natively, and the reader can
 * be a normal page module.
 */

export const SHARE_CACHE = 'share-target-v1';
export const SHARE_PAYLOAD_URL = '/__share/payload';
export const shareFileUrl = (index: number) => `/__share/file/${index}`;
/**
 * File name, which a `Response` body alone would lose. Percent-encoded: header
 * values are byte strings and shared photos routinely carry non-ASCII names.
 */
export const SHARE_FILENAME_HEADER = 'x-share-filename';

export interface SharedPayload {
  title: string;
  text: string;
  url: string;
  fileCount: number;
}

/**
 * Reads and *consumes* the stashed share. One-shot on purpose: reloading the
 * page the share landed on must not create a second note.
 */
export async function takeSharedPayload(): Promise<{
  payload: SharedPayload;
  files: File[];
} | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(SHARE_CACHE);
  const stored = await cache.match(SHARE_PAYLOAD_URL);
  if (!stored) return null;
  const payload = (await stored.json()) as SharedPayload;

  const files: File[] = [];
  for (let i = 0; i < payload.fileCount; i++) {
    const hit = await cache.match(shareFileUrl(i));
    if (!hit) continue;
    const blob = await hit.blob();
    const stamped = hit.headers.get(SHARE_FILENAME_HEADER);
    let name = `shared-${i}`;
    try {
      if (stamped) name = decodeURIComponent(stamped);
    } catch {
      // Malformed encoding: the fallback name is good enough to upload with.
    }
    files.push(new File([blob], name, { type: blob.type }));
  }

  await caches.delete(SHARE_CACHE);
  return { payload, files };
}

/**
 * Folds the three share fields into a note. Android hands the page URL in
 * `text` about as often as in `url`, so an already-appended url is not
 * repeated; the title is only borrowed as the note title when it is not just
 * the url again.
 */
export function sharedToNote(payload: SharedPayload): { title: string; body: string } {
  const text = payload.text.trim();
  const url = payload.url.trim();
  const title = payload.title.trim();
  const body = url && !text.includes(url) ? (text ? `${text}\n${url}` : url) : text;
  return { title: title === url ? '' : title, body };
}
