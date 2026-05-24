import type { StorageProvider } from '@wings2i-gracie/contracts';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export class LocalStorageProvider implements StorageProvider {
  private readonly uploadsDir: string;

  constructor(uploadsDir?: string) {
    this.uploadsDir = uploadsDir ?? path.join(process.cwd(), 'uploads');
  }

  async save(params: {
    tenantId: string;
    moduleKey: string;
    filename: string;
    buffer: Uint8Array;
    mimeType: string;
  }): Promise<{ fileId: string; filePath: string }> {
    const fileId = crypto.randomUUID();
    const safeFilename = params.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const relPath = `${params.tenantId}/${params.moduleKey}/${fileId}-${safeFilename}`;
    const absPath = path.join(this.uploadsDir, relPath);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, params.buffer);

    const filePath = '/uploads/' + relPath;
    return { fileId, filePath };
  }

  async retrieve(filePath: string): Promise<Buffer> {
    const relPath = filePath.replace(/^\/uploads\//, '');
    const absPath = path.join(this.uploadsDir, relPath);
    return fs.readFile(absPath);
  }

  async delete(filePath: string): Promise<void> {
    const relPath = filePath.replace(/^\/uploads\//, '');
    const absPath = path.join(this.uploadsDir, relPath);
    try {
      await fs.unlink(absPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
