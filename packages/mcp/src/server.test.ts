import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';
import { createOpenKeepMcpServer, type OpenKeepMcpServerOptions } from './server.js';
import { FakeOpenKeepClient } from './tools/fake-client.js';
import { allTools } from './tools/index.js';

interface Harness {
  client: Client;
  fake: FakeOpenKeepClient;
  close: () => Promise<void>;
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

/** In-process MCP round-trip: SDK client ↔ Streamable HTTP handler ↔ fake client. */
async function connect(opts?: OpenKeepMcpServerOptions): Promise<Harness> {
  const fake = new FakeOpenKeepClient();
  const handler = createMcpHandler(() => createOpenKeepMcpServer(fake, opts));
  const transport = new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
    fetch: ((url: string | URL, init?: RequestInit) =>
      handler.fetch(new Request(url, init))) as typeof fetch,
  });
  const client = new Client(
    { name: 'test-harness', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  await client.connect(transport);
  const close = async () => {
    await client.close();
    await handler.close();
  };
  cleanups.push(close);
  return { client, fake, close };
}

const textOf = (result: { content?: unknown }): string => {
  const blocks = result.content as { type: string; text?: string }[];
  const text = blocks.find((b) => b.type === 'text')?.text;
  if (text === undefined) throw new Error('no text content');
  return text;
};

describe('createOpenKeepMcpServer', () => {
  it('lists the full 59-tool catalog when localFs is available', async () => {
    const { client } = await connect({ capabilities: { localFs: true } });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(allTools.map((t) => t.name).sort());
    expect(tools).toHaveLength(59);
  });

  it('hides stdio-only tools without localFs (the mounted endpoint)', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(57);
    expect(names).not.toContain('download_export');
    expect(names).not.toContain('import_takeout');
    expect(names).toContain('upload_image');
    // import_markdown takes its files inline, so it is not stdio-only the way
    // import_takeout is — a hosted connector can still use it.
    expect(names).toContain('import_markdown');
  });

  it('advertises annotations and input schemas', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const search = tools.find((t) => t.name === 'search_notes');
    expect(search?.annotations?.readOnlyHint).toBe(true);
    const emptyTrash = tools.find((t) => t.name === 'empty_trash');
    expect(emptyTrash?.annotations?.destructiveHint).toBe(true);
    const getNote = tools.find((t) => t.name === 'get_note');
    expect(getNote?.inputSchema).toMatchObject({ type: 'object' });
  });

  it('executes a happy-path tool call end to end', async () => {
    const { client, fake } = await connect();
    const result = await client.callTool({
      name: 'create_note',
      arguments: { title: 'Via MCP', text: 'hello', labels: ['agente'] },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(textOf(result)) as { note: { title: string; labels: string[] } };
    expect(payload.note.title).toBe('Via MCP');
    expect(payload.note.labels).toEqual(['agente']);
    expect(fake.notes.size).toBe(1);
  });

  it('propagates handler failures as isError results with actionable text', async () => {
    const { client, fake } = await connect();
    const missing = await client.callTool({
      name: 'get_note',
      arguments: { note_id: '00000000-0000-7000-8000-000000000000' },
    });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain('Not found');

    const note = fake.seedNote({ trashedAt: new Date().toISOString() });
    const trashed = await client.callTool({
      name: 'update_note',
      arguments: { note_id: note.id, title: 'nope' },
    });
    expect(trashed.isError).toBe(true);
    expect(textOf(trashed)).toContain('restore_note');
  });

  it('rejects invalid arguments before the handler runs', async () => {
    const { client } = await connect();
    const result = await client.callTool({
      name: 'get_note',
      arguments: { note_id: 'not-a-uuid' },
    });
    expect(result.isError).toBe(true);
  });

  it('serves the notes list resource and the per-note template', async () => {
    const { client, fake } = await connect();
    const note = fake.seedNote({ title: 'Res', bodyHtml: '<p>body</p>' });

    const list = await client.readResource({ uri: 'openkeep://notes' });
    const listBody = JSON.parse((list.contents[0] as { text: string }).text) as { count: number };
    expect(listBody.count).toBe(1);

    const single = await client.readResource({ uri: `openkeep://notes/${note.id}` });
    const singleBody = JSON.parse((single.contents[0] as { text: string }).text) as {
      title: string;
      markdown: string;
    };
    expect(singleBody.title).toBe('Res');
    expect(singleBody.markdown).toBe('body');
  });

  it('serves both prompts', async () => {
    const { client } = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['capture_note', 'daily_review']);

    const prompt = await client.getPrompt({
      name: 'capture_note',
      arguments: { content: 'buy milk tomorrow' },
    });
    const message = prompt.messages[0] as { content: { type: string; text: string } };
    expect(message.content.text).toContain('buy milk tomorrow');
    expect(message.content.text).toContain('create_note');
  });
});
