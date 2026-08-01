import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from '@openkeep/shared';
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
  /** Bearer token for `GET /metrics`; unset leaves the endpoint unauthenticated. */
  METRICS_TOKEN: z.string().min(16, 'METRICS_TOKEN must be at least 16 characters').optional(),
  /** Days a trashed note survives. Keep's 7 by default; capped so the banner stays truthful. */
  TRASH_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(LIMITS.trashRetentionDays),
  /**
   * Five-field cron for the scheduled backup; unset means no backup job at all.
   * Only the shape is checked here — pg-boss owns the semantics — but an
   * obviously wrong value must fail at boot rather than silently never fire.
   */
  BACKUP_CRON: z
    .string()
    .regex(/^\S+(\s+\S+){4}$/, 'BACKUP_CRON must be a 5-field cron expression')
    .optional(),
  BACKUP_DIR: z.string().default('./backups'),
  /** Archives kept per account before the oldest is deleted. */
  BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(7),
  /**
   * Comma-separated e-mails that administer this instance. Unset means nobody
   * does — the admin panel simply is not there. Deliberately env and not a
   * column: who owns the deploy is a property of the deploy, it needs no
   * bootstrap answer for an empty database, and no request can grant it.
   */
  ADMIN_EMAILS: z.string().optional(),
  /**
   * Megabytes of attachments one account may own. Unset means no ceiling —
   * a single-user instance should not have to think about this at all.
   */
  USER_STORAGE_QUOTA_MB: z.coerce.number().int().min(1).max(10_000_000).optional(),
});

export type Config = z.infer<typeof EnvSchema> & {
  isProd: boolean;
  isDev: boolean;
  isTest: boolean;
  storageDirAbs: string;
  backupDirAbs: string;
  /** ADMIN_EMAILS, split and lowercased once at boot. */
  adminEmails: string[];
  /** USER_STORAGE_QUOTA_MB in bytes, or null when this instance has no cap. */
  storageQuotaBytes: number | null;
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
  // `FOO=` in a .env file must behave like an unset variable.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = EnvSchema.safeParse(cleaned);
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
    backupDirAbs: path.resolve(process.cwd(), cfg.BACKUP_DIR),
    adminEmails: (cfg.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
    storageQuotaBytes:
      cfg.USER_STORAGE_QUOTA_MB === undefined ? null : cfg.USER_STORAGE_QUOTA_MB * 1024 * 1024,
  };
}
