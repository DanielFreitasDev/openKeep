import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { FullNote, WsEnvelope } from '@openkeep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { TestApp } from './harness.js';
import { createTestApp } from './harness.js';

const RPC_ACCEPT = 'application/json, text/event-stream';

describe('mcp endpoint', () => {
  let t: TestApp;
  let cookie: string;
  let patSecret: string;
  let patId: string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.signUp('mcp-user@example.com', 'MCP User');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: { cookie },
      payload: { name: 'mcp-test' },
    });
    expect(created.statusCode).toBe(201);
    patSecret = created.json().token as string;
    patId = created.json().id as string;
  });
  afterAll(async () => {
    await t.close();
  });

  const rpc = (body: unknown, headers: Record<string, string> = {}) =>
    t.app.inject({
      method: 'POST',
      url: '/api/mcp',
      headers: {
        accept: RPC_ACCEPT,
        'content-type': 'application/json',
        authorization: `Bearer ${patSecret}`,
        ...headers,
      },
      payload: body as Record<string, unknown>,
    });

  describe('transport & auth', () => {
    it('rejects missing and malformed bearer tokens with 401 + WWW-Authenticate', async () => {
      const missing = await t.app.inject({
        method: 'POST',
        url: '/api/mcp',
        headers: { accept: RPC_ACCEPT, 'content-type': 'application/json' },
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      });
      expect(missing.statusCode).toBe(401);
      expect(missing.headers['www-authenticate']).toContain('Bearer');
      expect(missing.headers['content-type']).toContain('application/problem+json');
      expect(missing.json().code).toBe('unauthorized');

      const bogus = await rpc(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: 'Bearer okp_not-a-real-token-aaaaaaaaaaaaaaaaaaaaaaaaa' },
      );
      expect(bogus.statusCode).toBe(401);
    });

    it('answers initialize and a non-empty tools/list over raw JSON-RPC', async () => {
      const init = await rpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2026-07-28',
          capabilities: {},
          clientInfo: { name: 'raw-test', version: '1.0.0' },
        },
      });
      expect(init.statusCode).toBe(200);
      expect(init.body).toContain('"result"');
      expect(init.body).toContain('openkeep');

      const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      expect(list.statusCode).toBe(200);
      expect(list.body).toContain('create_note');
      expect(list.body).toContain('search_notes');
    });

    it('revoking the token cuts off the endpoint immediately', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/api/tokens',
        headers: { cookie },
        payload: { name: 'mcp-revoked' },
      });
      const revokedSecret = created.json().token as string;

      const before = await rpc(
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { authorization: `Bearer ${revokedSecret}` },
      );
      expect(before.statusCode).toBe(200);

      await t.app.inject({
        method: 'DELETE',
        url: `/api/tokens/${created.json().id}`,
        headers: { cookie },
      });
      const after = await rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        { authorization: `Bearer ${revokedSecret}` },
      );
      expect(after.statusCode).toBe(401);
    });

    it('keeps /api/mcp out of the OpenAPI spec', async () => {
      const spec = t.app.swagger();
      expect(Object.keys(spec.paths ?? {})).not.toContain('/api/mcp');
      expect(JSON.stringify(spec)).not.toContain('/api/mcp');
    });
  });

  describe('tools over the SDK client', () => {
    let client: Client;

    beforeAll(async () => {
      // Real HTTP semantics (auth gate, rate limit config, streaming) with
      // in-process dispatch: the transport's fetch is bridged to app.inject.
      const transport = new StreamableHTTPClientTransport(
        new URL('http://openkeep.internal/api/mcp'),
        {
          fetch: (async (input: string | URL | Request, init?: RequestInit) => {
            const request = input instanceof Request ? input : new Request(input, init);
            const headers = Object.fromEntries(new Headers(request.headers).entries());
            const body = request.method === 'GET' ? undefined : await request.text();
            const res = await t.app.inject({
              method: request.method as 'POST',
              url: '/api/mcp',
              headers: { ...headers, authorization: `Bearer ${patSecret}` },
              ...(body ? { payload: body } : {}),
            });
            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(res.headers)) {
              if (value === undefined) continue;
              responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
            }
            const payload =
              res.statusCode === 204 || res.statusCode === 304 ? null : res.rawPayload;
            return new Response(payload, { status: res.statusCode, headers: responseHeaders });
          }) as typeof fetch,
        },
      );
      client = new Client(
        { name: 'integration-test', version: '1.0.0' },
        { versionNegotiation: { mode: 'auto' } },
      );
      await client.connect(transport);
    });
    afterAll(async () => {
      await client.close();
    });

    const textOf = (result: { content?: unknown }): string => {
      const blocks = result.content as { type: string; text?: string }[];
      return blocks.find((b) => b.type === 'text')?.text ?? '';
    };

    it('excludes stdio-only tools from the mounted endpoint', async () => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);
      expect(names).toHaveLength(42);
      expect(names).not.toContain('download_export');
      expect(names).not.toContain('import_takeout');
      expect(names).toContain('upload_image');
    });

    it('create_note composite lands through the REST layer (items + new label)', async () => {
      const result = await client.callTool({
        name: 'create_note',
        arguments: {
          title: 'Compras via MCP',
          items: [{ text: 'Leite' }, { text: 'Pão' }, { text: 'Café' }],
          pinned: true,
          color: 'mint',
          labels: ['mercado'],
        },
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(textOf(result)) as {
        note: { id: string; labels?: string[] };
        warnings?: string[];
      };
      expect(payload.warnings).toBeUndefined();
      expect(payload.note.labels).toEqual(['mercado']);

      // Confirm through the plain REST surface with the same PAT.
      const rest = await t.app.inject({
        method: 'GET',
        url: `/api/notes/${payload.note.id}`,
        headers: { authorization: `Bearer ${patSecret}` },
      });
      expect(rest.statusCode).toBe(200);
      const note = rest.json() as FullNote;
      expect(note.type).toBe('list');
      expect(note.items.map((i) => i.text)).toEqual(['Leite', 'Pão', 'Café']);
      expect(note.pinned).toBe(true);
      expect(note.color).toBe('mint');
      expect(note.labelIds).toHaveLength(1);
    });

    it('get_note reads through the new single-note endpoint', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/api/notes',
        headers: { cookie },
        payload: { title: 'Single via tool', bodyHtml: '<p>corpo</p>' },
      });
      const noteId = (created.json() as FullNote).id;

      const result = await client.callTool({ name: 'get_note', arguments: { note_id: noteId } });
      expect(result.isError).toBeFalsy();
      const rendered = JSON.parse(textOf(result)) as { title: string; markdown: string };
      expect(rendered.title).toBe('Single via tool');
      expect(rendered.markdown).toBe('corpo');
    });

    it('editing a trashed note fails with guidance to restore_note', async () => {
      const created = await t.app.inject({
        method: 'POST',
        url: '/api/notes',
        headers: { cookie },
        payload: { title: 'Trash me' },
      });
      const noteId = (created.json() as FullNote).id;
      await t.app.inject({
        method: 'POST',
        url: `/api/notes/${noteId}/trash`,
        headers: { cookie },
      });

      const result = await client.callTool({
        name: 'update_note',
        arguments: { note_id: noteId, title: 'nope' },
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('restore_note');
    });

    it('search_notes returns cards with a headline', async () => {
      await client.callTool({
        name: 'create_note',
        arguments: { title: 'Fauna', text: 'A zebra galopa na savana aberta' },
      });
      const result = await client.callTool({ name: 'search_notes', arguments: { q: 'zebra' } });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(textOf(result)) as {
        count: number;
        notes: { headline?: string }[];
      };
      expect(payload.count).toBeGreaterThan(0);
      expect(payload.notes.some((n) => n.headline?.includes('zebra'))).toBe(true);
    });

    it('MCP mutations fan out over WS with the mcp:<tokenId> origin', async () => {
      await t.app.listen({ port: 0, host: '127.0.0.1' });
      const address = t.app.server.address() as AddressInfo;
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/ws`, {
        headers: { cookie },
      });
      const added = new Promise<WsEnvelope>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting for note.added')), 3000);
        socket.on('message', (data) => {
          const envelope = JSON.parse(String(data)) as WsEnvelope;
          if (envelope.type === 'note.added') {
            clearTimeout(timer);
            resolve(envelope);
          }
        });
        socket.once('error', reject);
      });
      await new Promise<void>((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });

      try {
        const result = await client.callTool({
          name: 'create_note',
          arguments: { title: 'Realtime via MCP' },
        });
        expect(result.isError).toBeFalsy();
        const envelope = await added;
        expect(envelope.origin).toBe(`mcp:${patId}`);
        expect((envelope.payload as { note: FullNote }).note.title).toBe('Realtime via MCP');
      } finally {
        socket.close();
      }
    });
  });
});
