import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { OpenKeepApiError } from './client/errors.js';
import { FetchClient } from './client/fetch-client.js';
import { loadConfig } from './config.js';
import { createOpenKeepMcpServer } from './server.js';

// stdout is the JSON-RPC channel — every human-facing line goes to stderr.

async function main(): Promise<void> {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  if (!config.token.startsWith('okp_')) {
    console.error(
      'warning: OPENKEEP_TOKEN does not look like an OpenKeep token (expected the okp_ prefix)',
    );
  }

  const client = new FetchClient({
    baseUrl: config.url,
    token: config.token,
    ...(config.clientId ? { clientId: config.clientId } : {}),
  });

  // Fail fast with a clear message instead of surfacing errors tool-by-tool.
  try {
    await client.getSettings();
  } catch (err) {
    if (err instanceof OpenKeepApiError && err.status === 401) {
      console.error(
        `OPENKEEP_TOKEN was rejected by ${config.url} — it may be revoked or expired. Create a new token in OpenKeep Settings → API tokens.`,
      );
    } else {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(
        `Could not reach OpenKeep at ${config.url} (${reason}). Check OPENKEEP_URL and that the server is running.`,
      );
    }
    process.exit(1);
  }

  const handle = serveStdio(() =>
    createOpenKeepMcpServer(client, { capabilities: { localFs: true } }),
  );
  console.error(`openkeep-mcp: connected to ${config.url} (client id ${client.clientId})`);

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void handle.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
