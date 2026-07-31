import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Production: serve the built SPA same-origin (CORS never registered) with a
 * strict CSP. `img-src https:` allows link-preview favicons/images, which the
 * BROWSER loads directly (the server never proxies them); `blob:` allows the
 * composer/editor to preview a picked image from `URL.createObjectURL` before
 * it is ever uploaded — without it the preview is silently blocked in prod
 * only, since dev is served by Vite with no CSP at all.
 */
export const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function findWebDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.WEB_DIST_DIR,
    path.resolve(here, '../../../web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web-dist'),
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c;
  }
  return null;
}

export async function registerSpa(app: FastifyInstance, distDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: distDir,
    wildcard: false,
    setHeaders: (reply, filePath) => {
      void reply.header('content-security-policy', SPA_CSP);
      if (/\/assets\//.test(filePath)) {
        void reply.header('cache-control', 'public, max-age=31536000, immutable');
      } else {
        void reply.header('cache-control', 'no-cache');
      }
    },
  });
}

/**
 * SPA fallback for client routes. Fastify allows a single not-found handler
 * per prefix, and the error-handler plugin owns it — this is plugged in there
 * (via buildApp) instead of calling setNotFoundHandler a second time.
 */
export function spaFallback(req: FastifyRequest, reply: FastifyReply): unknown {
  // A public share page is one HTML shell like every other route, so the only
  // place to say "don't index this" is the response that serves it — the same
  // thing robots.txt says, for the crawlers that read headers instead.
  if (req.url.startsWith('/s/')) void reply.header('x-robots-tag', 'noindex, nofollow');
  return reply
    .header('content-security-policy', SPA_CSP)
    .header('cache-control', 'no-cache')
    .type('text/html')
    .sendFile('index.html');
}
