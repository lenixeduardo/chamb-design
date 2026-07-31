import { toDataUri } from './probe.js';

/**
 * Where asset bytes end up.
 *
 * The adapter is the seam that keeps local-first honest: with `DataUriStorage`
 * a project is a single self-contained JSON blob and needs no server at all.
 * Point the same ingestion pipeline at `HttpStorage` or `FilesystemStorage` and
 * nothing upstream changes — the document still just holds a URL string.
 */

export interface StoredObject {
  url: string;
  size: number;
  mimeType: string;
}

export interface StorageAdapter {
  readonly id: string;
  /** Human-readable, shown in the assets panel so users know where bytes go. */
  readonly label: string;
  put(input: { bytes: Uint8Array; mimeType: string; name: string }): Promise<StoredObject>;
  remove?(url: string): Promise<void>;
}

/**
 * Inline `data:` URIs.
 *
 * The default, because it makes a project portable with zero infrastructure.
 * The cost is real and worth stating: base64 inflates bytes by ~33% and the
 * whole payload lives inside the document, so `maxBytes` caps what can be
 * inlined rather than letting someone silently embed a 12 MB photo into
 * localStorage and hit the quota.
 */
export class DataUriStorage implements StorageAdapter {
  readonly id = 'data-uri';
  readonly label = 'Embutido no projeto (sem servidor)';

  constructor(private readonly maxBytes = 2 * 1024 * 1024) {}

  async put({ bytes, mimeType, name }: { bytes: Uint8Array; mimeType: string; name: string }) {
    if (bytes.byteLength > this.maxBytes) {
      throw new StorageError(
        `"${name}" is ${formatBytes(bytes.byteLength)}; inline storage is capped at ${formatBytes(
          this.maxBytes,
        )}. Configure a storage adapter to handle larger files.`,
      );
    }
    return { url: toDataUri(bytes, mimeType), size: bytes.byteLength, mimeType };
  }
}

/** Keeps bytes in memory and hands back blob-ish URLs. Used by tests. */
export class MemoryStorage implements StorageAdapter {
  readonly id = 'memory';
  readonly label = 'Em memória';
  readonly objects = new Map<string, { bytes: Uint8Array; mimeType: string }>();

  private counter = 0;

  async put({ bytes, mimeType, name }: { bytes: Uint8Array; mimeType: string; name: string }) {
    const url = `memory://${(this.counter += 1)}/${encodeURIComponent(name)}`;
    this.objects.set(url, { bytes, mimeType });
    return { url, size: bytes.byteLength, mimeType };
  }

  async remove(url: string) {
    this.objects.delete(url);
  }
}

/**
 * Uploads through an HTTP endpoint.
 *
 * Deliberately generic: it posts multipart form data and expects `{ url }` back.
 * That covers the project's own `/api/assets` route, an S3 presign broker, or a
 * Supabase storage function — without this package taking a dependency on any
 * of them, or embedding credentials in the client.
 */
export class HttpStorage implements StorageAdapter {
  readonly id = 'http';
  readonly label: string;

  constructor(
    private readonly endpoint: string,
    private readonly options: {
      label?: string;
      headers?: Record<string, string>;
      fetch?: typeof fetch;
      /** Field name for the file part; some brokers expect something else. */
      fieldName?: string;
    } = {},
  ) {
    this.label = options.label ?? `Upload para ${endpoint}`;
  }

  async put({ bytes, mimeType, name }: { bytes: Uint8Array; mimeType: string; name: string }) {
    const doFetch = this.options.fetch ?? globalThis.fetch;

    const form = new FormData();
    // Copy into a fresh ArrayBuffer: `bytes` may be a view over a larger
    // buffer, and Blob would otherwise capture the whole thing.
    const buffer = new Uint8Array(bytes).buffer;
    form.append(this.options.fieldName ?? 'file', new Blob([buffer], { type: mimeType }), name);

    const response = await doFetch(this.endpoint, {
      method: 'POST',
      body: form,
      ...(this.options.headers ? { headers: this.options.headers } : {}),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new StorageError(
        `upload failed with ${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }

    const payload = (await response.json().catch(() => null)) as { url?: string } | null;
    if (!payload?.url) {
      throw new StorageError('upload endpoint did not return a { url } payload');
    }

    return { url: payload.url, size: bytes.byteLength, mimeType };
  }

  async remove(url: string) {
    const doFetch = this.options.fetch ?? globalThis.fetch;
    await doFetch(this.endpoint, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', ...this.options.headers },
      body: JSON.stringify({ url }),
    }).catch(() => undefined);
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(`[opendesign:assets] ${message}`);
    this.name = 'StorageError';
  }
}

/** Strips path separators and anything that would escape the target directory. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 120) || 'file'
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
