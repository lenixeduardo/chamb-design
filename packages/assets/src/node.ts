import { StorageError, sanitizeFileName, type StorageAdapter } from './storage.js';

/**
 * Server-only storage adapters.
 *
 * Kept out of the main entry point deliberately: `node:fs` cannot be resolved
 * in a browser bundle, and a dynamic import is not enough — bundlers still trace
 * it. A separate entry point means the client never sees this file at all.
 *
 *   import { FilesystemStorage } from '@opendesign/assets/node';
 */
export class FilesystemStorage implements StorageAdapter {
  readonly id = 'filesystem';
  readonly label: string;

  constructor(
    private readonly directory: string,
    private readonly publicPath = '/assets',
  ) {
    this.label = `Write to ${directory}`;
  }

  async put({ bytes, mimeType, name }: { bytes: Uint8Array; mimeType: string; name: string }) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const safe = sanitizeFileName(name);
    if (!safe) throw new StorageError(`could not derive a safe file name from "${name}"`);

    // Timestamp prefix rather than a hash: two uploads of the same photo should
    // not silently collapse into one file the user cannot tell apart.
    const unique = `${Date.now().toString(36)}-${safe}`;

    await mkdir(this.directory, { recursive: true });
    await writeFile(join(this.directory, unique), bytes);

    return { url: `${this.publicPath}/${unique}`, size: bytes.byteLength, mimeType };
  }

  async remove(url: string) {
    const { unlink } = await import('node:fs/promises');
    const { join, basename } = await import('node:path');
    // basename() is the guard: a url is attacker-controlled in a hosted setup.
    await unlink(join(this.directory, basename(url))).catch(() => undefined);
  }
}
