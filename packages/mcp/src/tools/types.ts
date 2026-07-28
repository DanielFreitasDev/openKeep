import type { z } from 'zod';
import type { OpenKeepClient } from '../client/types.js';

export interface ToolCapabilities {
  /** True on stdio (same machine as the user) — enables path-based tools. */
  localFs: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

/** Handler result carrying binary image data (rendered as MCP image content). */
export class ImageOutput {
  constructor(
    readonly base64: string,
    readonly mimeType: string,
    readonly meta?: Record<string, unknown>,
  ) {}
}

/** SDK-neutral tool definition — only server.ts touches the MCP SDK. */
export interface ToolDef {
  name: string;
  description: string;
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous catalog; per-tool typing via defineTool
  inputSchema: z.ZodObject<any>;
  annotations?: ToolAnnotations;
  /** Needs the local filesystem — registered only when capabilities.localFs. */
  stdioOnly?: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: args are validated by inputSchema before dispatch
  handler: (client: OpenKeepClient, args: any, caps: ToolCapabilities) => Promise<unknown>;
}

/** Typed helper so each tool's handler sees its own parsed args type. */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string;
  description: string;
  inputSchema: S;
  annotations?: ToolAnnotations;
  stdioOnly?: boolean;
  handler: (client: OpenKeepClient, args: z.output<S>, caps: ToolCapabilities) => Promise<unknown>;
}): ToolDef {
  return def as ToolDef;
}
