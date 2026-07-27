import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  APP_URL: z.url(),
  STORAGE_DIR: z.string().default('./storage'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  METRICS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof EnvSchema> & {
  isProd: boolean;
  isDev: boolean;
  isTest: boolean;
  storageDirAbs: string;
};

/** Load `.env` from cwd or repo root without overriding real env vars. */
export function loadDotenv(): void {
  for (const rel of ['.env', '../../.env']) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) {
      process.loadEnvFile(abs);
      return;
    }
  }
}

/** Parse and validate configuration; throws a readable error listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const cfg = parsed.data;
  if ((cfg.GOOGLE_CLIENT_ID === undefined) !== (cfg.GOOGLE_CLIENT_SECRET === undefined)) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together');
  }
  if ((cfg.GITHUB_CLIENT_ID === undefined) !== (cfg.GITHUB_CLIENT_SECRET === undefined)) {
    throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together');
  }
  if ((cfg.VAPID_PUBLIC_KEY === undefined) !== (cfg.VAPID_PRIVATE_KEY === undefined)) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together');
  }
  return {
    ...cfg,
    isProd: cfg.NODE_ENV === 'production',
    isDev: cfg.NODE_ENV === 'development',
    isTest: cfg.NODE_ENV === 'test',
    storageDirAbs: path.resolve(process.cwd(), cfg.STORAGE_DIR),
  };
}
