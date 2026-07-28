import { describe, expect, it, vi } from 'vitest';
import { OpenKeepApiError } from './errors.js';
import { FetchClient } from './fetch-client.js';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function clientWith(impl: typeof fetch) {
  return new FetchClient({
    baseUrl: 'http://keep.test/',
    token: 'okp_secret',
    clientId: 'mcp-test',
    fetchImpl: impl,
  });
}

describe('FetchClient', () => {
  it('sends bearer auth, x-client-id and JSON content type; strips trailing slash', async () => {
    const impl = vi.fn(async () => jsonResponse([]));
    await clientWith(impl as unknown as typeof fetch).createNote({ title: 'x' });

    const [url, init] = impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://keep.test/api/notes');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer okp_secret');
    expect(headers['x-client-id']).toBe('mcp-test');
    expect(headers['content-type']).toBe('application/json');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'x' });
  });

  it('serializes query params and omits undefined ones', async () => {
    const impl = vi.fn(async () => jsonResponse([]));
    await clientWith(impl as unknown as typeof fetch).listNotes({ view: 'archived' });
    const [url] = impl.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://keep.test/api/notes?view=archived');
  });

  it('maps 204 to undefined', async () => {
    const impl = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await clientWith(impl as unknown as typeof fetch).deleteLabel('x');
    expect(result).toBeUndefined();
  });

  it('turns problem+json into OpenKeepApiError with code and retryAfter', async () => {
    const impl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'Too Many Requests',
            status: 429,
            code: 'rate_limited',
          }),
          { status: 429, headers: { 'retry-after': '17' } },
        ),
    );
    const err = await clientWith(impl as unknown as typeof fetch)
      .getSettings()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenKeepApiError);
    expect((err as OpenKeepApiError).code).toBe('rate_limited');
    expect((err as OpenKeepApiError).retryAfter).toBe(17);
  });

  it('synthesizes a problem for non-JSON error bodies', async () => {
    const impl = vi.fn(async () => new Response('nope', { status: 401 }));
    const err = await clientWith(impl as unknown as typeof fetch)
      .listNotes()
      .catch((e: unknown) => e);
    expect((err as OpenKeepApiError).code).toBe('unauthorized');
    expect((err as OpenKeepApiError).status).toBe(401);
  });

  it('uploads multipart without forcing a JSON content type', async () => {
    const impl = vi.fn(async () =>
      jsonResponse(
        {
          id: '0189aaaa-0000-7000-8000-000000000001',
          kind: 'image',
          mime: 'image/png',
          width: 1,
          height: 1,
          hasThumb: true,
          createdAt: new Date().toISOString(),
        },
        201,
      ),
    );
    await clientWith(impl as unknown as typeof fetch).uploadImage(
      '0189aaaa-0000-7000-8000-000000000002',
      new Uint8Array([1, 2, 3]),
      'photo.png',
    );
    const [, init] = impl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBeUndefined();
    const file = (init.body as FormData).get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe('photo.png');
  });

  it('downloads binaries as Uint8Array with the response mime', async () => {
    const impl = vi.fn(
      async () =>
        new Response(new Uint8Array([9, 8, 7]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
    );
    const { data, mime } = await clientWith(impl as unknown as typeof fetch).downloadAttachment(
      'a',
      'thumb',
    );
    expect([...data]).toEqual([9, 8, 7]);
    expect(mime).toBe('image/webp');
  });

  it('propagates network failures untouched (no retry)', async () => {
    const impl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(clientWith(impl as unknown as typeof fetch).listNotes()).rejects.toThrow(
      'fetch failed',
    );
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('parses the version download filename from content-disposition', async () => {
    const impl = vi.fn(
      async () =>
        new Response('Title\n\nbody', {
          status: 200,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'content-disposition': 'attachment; filename="my-note-2026-07-28.txt"',
          },
        }),
    );
    const result = await clientWith(impl as unknown as typeof fetch).downloadVersion('n', 'v');
    expect(result).toEqual({ filename: 'my-note-2026-07-28.txt', content: 'Title\n\nbody' });
  });
});
