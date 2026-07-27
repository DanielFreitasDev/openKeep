import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export type StorageArea = 'attachments' | 'thumbs' | 'exports';

/** Flat-file storage under STORAGE_DIR with opaque UUID keys. */
export class Storage {
  constructor(private readonly rootDir: string) {}

  async init(): Promise<void> {
    for (const area of ['attachments', 'thumbs', 'exports'] as const) {
      await fsp.mkdir(path.join(this.rootDir, area), { recursive: true });
    }
  }

  newKey(ext = 'bin'): string {
    return `${randomUUID()}.${ext.replace(/[^a-z0-9]/gi, '')}`;
  }

  pathFor(area: StorageArea, key: string): string {
    // Keys are server-generated UUIDs; the basename call is a hard backstop.
    return path.join(this.rootDir, area, path.basename(key));
  }

  async write(area: StorageArea, key: string, data: Buffer): Promise<void> {
    await fsp.writeFile(this.pathFor(area, key), data);
  }

  createReadStream(area: StorageArea, key: string): fs.ReadStream {
    return fs.createReadStream(this.pathFor(area, key));
  }

  async exists(area: StorageArea, key: string): Promise<boolean> {
    return fsp
      .access(this.pathFor(area, key))
      .then(() => true)
      .catch(() => false);
  }

  async remove(area: StorageArea, key: string): Promise<void> {
    await fsp.rm(this.pathFor(area, key), { force: true });
  }

  async size(area: StorageArea, key: string): Promise<number> {
    return (await fsp.stat(this.pathFor(area, key))).size;
  }
}
