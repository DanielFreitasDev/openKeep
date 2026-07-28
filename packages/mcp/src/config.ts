import { z } from 'zod';

const EnvSchema = z.object({
  OPENKEEP_URL: z.url({
    message: 'OPENKEEP_URL must be a full URL, e.g. https://keep.example.com',
  }),
  OPENKEEP_TOKEN: z
    .string()
    .min(1, 'OPENKEEP_TOKEN is required — create one in OpenKeep Settings → API tokens'),
  OPENKEEP_CLIENT_ID: z.string().min(1).max(100).optional(),
});

export interface McpConfig {
  url: string;
  token: string;
  clientId?: string | undefined;
}

/** Parse stdio env config; throws one readable error listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  // `FOO=` must behave like an unset variable (same rule as the app server).
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`,
    );
    throw new Error(`Invalid openkeep-mcp configuration:\n${lines.join('\n')}`);
  }
  return {
    url: parsed.data.OPENKEEP_URL.replace(/\/+$/, ''),
    token: parsed.data.OPENKEEP_TOKEN,
    clientId: parsed.data.OPENKEEP_CLIENT_ID,
  };
}
