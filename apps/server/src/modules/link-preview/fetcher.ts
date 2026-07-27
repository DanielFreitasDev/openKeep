import { Agent, request } from 'undici';
import { resolvePinned } from '../../lib/ssrf-guard.js';

export interface FetchedPreview {
  ok: boolean;
  title?: string;
  description?: string;
  siteName?: string;
  faviconUrl?: string;
  imageUrl?: string;
}

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

function pinnedAgent(address: string, family: 4 | 6): Agent {
  return new Agent({
    connect: {
      // Pin every socket to the pre-validated address (rebinding defense).
      lookup: (_host, _opts, cb) => cb(null, [{ address, family }]),
      timeout: TIMEOUT_MS,
    },
  });
}

function pick(re: RegExp, html: string): string | undefined {
  const m = html.match(re);
  const v = m?.[1]?.trim();
  return v ? decodeEntities(v).slice(0, 300) : undefined;
}

function decodeEntities(s: string): string {
  const map: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => map[m] ?? m);
}

function metaContent(html: string, prop: string): string | undefined {
  return (
    pick(
      new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
      html,
    ) ??
    pick(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
      html,
    )
  );
}

function absolutize(base: URL, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  try {
    const abs = new URL(ref, base);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return undefined;
    return abs.toString().slice(0, 2000);
  } catch {
    return undefined;
  }
}

/**
 * SSRF-safe metadata fetch: pinned-IP connections, manual re-validated
 * redirects (≤3), 10s/2MB caps, head-only parse. The server never fetches
 * preview images — URLs are stored and the browser loads them.
 */
export async function fetchLinkPreview(rawUrl: string): Promise<FetchedPreview> {
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { url, target } = await resolvePinned(currentUrl);
    const agent = pinnedAgent(target.address, target.family);
    try {
      const res = await request(url, {
        dispatcher: agent,
        method: 'GET',
        headersTimeout: TIMEOUT_MS,
        bodyTimeout: TIMEOUT_MS,
        headers: {
          'user-agent': 'OpenKeep-LinkPreview/1.0 (+self-hosted)',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en, pt-BR',
        },
      });

      if (res.statusCode >= 300 && res.statusCode < 400) {
        const loc = res.headers.location;
        await res.body.dump({ limit: 4096 }).catch(() => {});
        const locStr = Array.isArray(loc) ? loc[0] : loc;
        if (!locStr) return { ok: false };
        currentUrl = new URL(locStr, url).toString();
        continue;
      }
      if (res.statusCode !== 200) {
        await res.body.dump({ limit: 4096 }).catch(() => {});
        return { ok: false };
      }
      const ctype = String(res.headers['content-type'] ?? '');
      if (!ctype.includes('text/html') && !ctype.includes('xhtml')) {
        await res.body.dump({ limit: 4096 }).catch(() => {});
        return { ok: false };
      }

      // Read up to the cap or </head>, whichever comes first.
      let html = '';
      for await (const chunk of res.body) {
        html += chunk.toString('utf8');
        if (html.length >= MAX_BYTES || /<\/head>/i.test(html)) {
          res.body.destroy();
          break;
        }
      }

      const title = metaContent(html, 'og:title') ?? pick(/<title[^>]*>([^<]+)<\/title>/i, html);
      const faviconHref =
        pick(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i, html) ??
        pick(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i, html) ??
        '/favicon.ico';

      return {
        ok: true,
        ...(title ? { title } : {}),
        ...((metaContent(html, 'og:description') ?? metaContent(html, 'description'))
          ? { description: metaContent(html, 'og:description') ?? metaContent(html, 'description') }
          : {}),
        ...(metaContent(html, 'og:site_name')
          ? { siteName: metaContent(html, 'og:site_name') }
          : {}),
        ...(absolutize(url, faviconHref) ? { faviconUrl: absolutize(url, faviconHref) } : {}),
        ...(absolutize(url, metaContent(html, 'og:image'))
          ? { imageUrl: absolutize(url, metaContent(html, 'og:image')) }
          : {}),
      };
    } finally {
      await agent.close().catch(() => {});
    }
  }
  return { ok: false };
}
