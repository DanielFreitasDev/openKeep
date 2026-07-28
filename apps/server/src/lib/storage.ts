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

  /** All files in an area with mtimes — used by the storage reconcile job. */
  async list(area: StorageArea): Promise<{ key: string; mtimeMs: number }[]> {
    const dir = path.join(this.rootDir, area);
    const names = await fsp.readdir(dir).catch(() => [] as string[]);
    const out: { key: string; mtimeMs: number }[] = [];
    for (const name of names) {
      const st = await fsp.stat(path.join(dir, name)).catch(() => null);
      if (st?.isFile()) out.push({ key: name, mtimeMs: st.mtimeMs });
    }
    return out;
  }

  async size(area: StorageArea, key: string): Promise<number> {
    return (await fsp.stat(this.pathFor(area, key))).size;
  }
}
