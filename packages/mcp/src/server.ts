import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { APP_VERSION } from '@openkeep/shared';
import { OpenKeepApiError } from './client/errors.js';
import type { OpenKeepClient } from './client/types.js';
import { allPrompts } from './prompts.js';
import { noteResource, notesListResource } from './resources.js';
import { allTools } from './tools/index.js';
import { AudioOutput, FileOutput, ImageOutput, type ToolCapabilities } from './tools/types.js';

export interface OpenKeepMcpServerOptions {
  capabilities?: { localFs?: boolean };
}

const INSTRUCTIONS = [
  'OpenKeep is a Google Keep-style notes app. Notes are text or checklists and can be pinned,',
  'colored, labeled, archived, shared and given (recurring) reminders.',
  'Start with list_notes or search_notes to find things; get_note reads one note in full.',
  'create_note handles content, labels, reminder and state in a single call.',
  'Note bodies are markdown by default — the same syntax comes back out as goes in; HTML only appears when asked for (include_html/body_html).',
  'Every change appears live in the user’s open browser tabs.',
].join(' ');

/** Actionable, code-aware messages for the model (RFC 9457 → text). */
function apiErrorMessage(err: OpenKeepApiError): string {
  const detail = err.problem.detail ?? err.problem.title;
  switch (err.code) {
    case 'note_trashed':
      return 'The note is in the trash and read-only — restore it first with restore_note.';
    case 'unauthorized':
      return 'Authentication failed: the API token is invalid, expired or revoked. Ask the user to create a new token in OpenKeep Settings → API tokens and reconnect.';
    case 'forbidden':
      return `Not allowed: ${detail}`;
    case 'not_found':
      return 'Not found. The id may be wrong, the item may have been deleted, or this account has no access to it.';
    case 'validation_failed': {
      const fields = (err.problem.errors ?? []).map((e) => `${e.path}: ${e.message}`).join('; ');
      return `Invalid input${fields ? ` — ${fields}` : ` — ${detail}`}`;
    }
    case 'label_limit_reached':
    case 'item_limit_reached':
    case 'attachment_limit_reached':
    case 'collaborator_limit_reached':
    case 'token_limit_reached':
      return `Limit reached: ${detail}`;
    case 'label_exists':
      return 'A label with this name already exists here (names are unique among siblings, case-insensitive).';
    case 'label_cycle':
      return 'A label cannot be nested inside itself or inside one of its own sub-labels.';
    case 'sharing_disabled':
      return 'Sharing is disabled in this account’s settings — enable it with update_settings (sharingEnabled: true).';
    case 'sharing_disabled_for_target':
      return 'That user has sharing disabled in their settings; they must enable it before being added.';
    case 'collaborator_not_registered':
      return 'No OpenKeep account exists for that email — collaborators must sign up first.';
    case 'already_collaborator':
      return 'That user is already a collaborator on this note.';
    case 'payload_too_large':
      return `Too large: ${detail}`;
    case 'unsupported_media_type':
      return `Unsupported file type: ${detail}`;
    case 'rate_limited':
      return `Rate limited — wait ${err.retryAfter ?? 'a few'} seconds and try again.`;
    case 'conflict':
      return `Conflict: ${detail}`;
    default:
      return `OpenKeep error (${err.code}): ${detail}`;
  }
}

function errorText(err: unknown): string {
  if (err instanceof OpenKeepApiError) return apiErrorMessage(err);
  if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
    return 'Could not reach the OpenKeep server — check OPENKEEP_URL and that the app is running.';
  }
  return err instanceof Error ? err.message : String(err);
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; mimeType: string; blob: string } };

/** The metadata line that rides along with every binary block. */
function metaBlock(meta: Record<string, unknown> | undefined): ContentBlock[] {
  return meta ? [{ type: 'text' as const, text: JSON.stringify(meta) }] : [];
}

function toContent(result: unknown): ContentBlock[] {
  if (result instanceof ImageOutput) {
    return [
      { type: 'image', data: result.base64, mimeType: result.mimeType },
      ...metaBlock(result.meta),
    ];
  }
  if (result instanceof AudioOutput) {
    return [
      { type: 'audio', data: result.base64, mimeType: result.mimeType },
      ...metaBlock(result.meta),
    ];
  }
  if (result instanceof FileOutput) {
    return [
      {
        type: 'resource',
        resource: { uri: result.uri, mimeType: result.mimeType, blob: result.base64 },
      },
      ...metaBlock(result.meta),
    ];
  }
  return [{ type: 'text', text: JSON.stringify(result ?? { ok: true }) }];
}

/**
 * Builds the MCP server over any OpenKeepClient. All SDK-facing code lives
 * here (and in stdio.ts / the server's plugins/mcp.ts) by design.
 */
export function createOpenKeepMcpServer(
  client: OpenKeepClient,
  opts: OpenKeepMcpServerOptions = {},
): McpServer {
  const caps: ToolCapabilities = { localFs: opts.capabilities?.localFs ?? false };
  const server = new McpServer(
    { name: 'openkeep', version: APP_VERSION },
    { instructions: INSTRUCTIONS },
  );

  for (const tool of allTools) {
    if (tool.stdioOnly && !caps.localFs) continue;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      },
      async (args: Record<string, unknown>) => {
        try {
          return { content: toContent(await tool.handler(client, args, caps)) };
        } catch (err) {
          return { content: [{ type: 'text' as const, text: errorText(err) }], isError: true };
        }
      },
    );
  }

  server.registerResource(
    'notes',
    'openkeep://notes',
    {
      title: 'All active notes',
      description: 'Compact cards for every active note',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: await notesListResource(client) },
      ],
    }),
  );

  server.registerResource(
    'note',
    new ResourceTemplate('openkeep://notes/{id}', { list: undefined }),
    {
      title: 'A single note',
      description: 'Full JSON rendering of one note by id',
      mimeType: 'application/json',
    },
    async (uri, vars) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: await noteResource(client, String((vars as { id: string }).id)),
        },
      ],
    }),
  );

  for (const prompt of allPrompts) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        ...(prompt.argsSchema ? { argsSchema: prompt.argsSchema } : {}),
      },
      (args: Record<string, unknown>) => ({
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text: prompt.build(args) },
          },
        ],
      }),
    );
  }

  return server;
}
