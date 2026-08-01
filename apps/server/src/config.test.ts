import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  APP_URL: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const cfg = loadConfig({ ...valid });
    expect(cfg.PORT).toBe(3000);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.isDev).toBe(true);
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('defaults trash retention to Keep parity and takes a valid override', () => {
    expect(loadConfig({ ...valid }).TRASH_RETENTION_DAYS).toBe(7);
    expect(loadConfig({ ...valid, TRASH_RETENTION_DAYS: '30' }).TRASH_RETENTION_DAYS).toBe(30);
  });

  // A zero or fractional window would silently purge on the next hourly run.
  it('rejects a trash retention that is not a positive whole number of days', () => {
    expect(() => loadConfig({ ...valid, TRASH_RETENTION_DAYS: '0' })).toThrow(
      /TRASH_RETENTION_DAYS/,
    );
    expect(() => loadConfig({ ...valid, TRASH_RETENTION_DAYS: '1.5' })).toThrow(
      /TRASH_RETENTION_DAYS/,
    );
  });

  it('leaves the scheduled backup off unless a cron is given', () => {
    const off = loadConfig({ ...valid });
    expect(off.BACKUP_CRON).toBeUndefined();
    expect(off.BACKUP_KEEP).toBe(7);
    const on = loadConfig({ ...valid, BACKUP_CRON: '0 4 * * *', BACKUP_KEEP: '3' });
    expect(on.BACKUP_CRON).toBe('0 4 * * *');
    expect(on.BACKUP_KEEP).toBe(3);
  });

  // A cron that never fires is indistinguishable from "backups are running".
  it('rejects a cron that is not five fields', () => {
    expect(() => loadConfig({ ...valid, BACKUP_CRON: 'daily' })).toThrow(/BACKUP_CRON/);
    expect(() => loadConfig({ ...valid, BACKUP_CRON: '0 4 * *' })).toThrow(/BACKUP_CRON/);
  });

  it('leaves storage uncapped unless a quota is given, and takes it in megabytes', () => {
    expect(loadConfig({ ...valid }).storageQuotaBytes).toBeNull();
    expect(loadConfig({ ...valid, USER_STORAGE_QUOTA_MB: '2048' }).storageQuotaBytes).toBe(
      2048 * 1024 * 1024,
    );
  });

  // A zero or fractional quota would refuse every upload, or round to one.
  it('rejects a quota that is not a positive whole number of megabytes', () => {
    expect(() => loadConfig({ ...valid, USER_STORAGE_QUOTA_MB: '0' })).toThrow(
      /USER_STORAGE_QUOTA_MB/,
    );
    expect(() => loadConfig({ ...valid, USER_STORAGE_QUOTA_MB: '0.5' })).toThrow(
      /USER_STORAGE_QUOTA_MB/,
    );
  });

  it('rejects a missing DATABASE_URL with a readable message', () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  it('rejects secrets shorter than 32 chars', () => {
    expect(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(/32 characters/);
  });

  it('rejects a non-URL APP_URL', () => {
    expect(() => loadConfig({ ...valid, APP_URL: 'not a url' })).toThrow(/APP_URL/);
  });

  it('requires OAuth id+secret pairs to be set together', () => {
    expect(() => loadConfig({ ...valid, GOOGLE_CLIENT_ID: 'id-only' })).toThrow(/together/);
  });

  it('treats empty-string env vars as unset', () => {
    const cfg = loadConfig({
      ...valid,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      SMTP_URL: '',
    });
    expect(cfg.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(cfg.SMTP_URL).toBeUndefined();
  });
});
