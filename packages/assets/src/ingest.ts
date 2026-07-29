import {
  createId,
  type Asset,
  type AssetKind,
  type DesignDocument,
  type NodeId,
  type Operation,
  type SceneNode,
} from '@opendesign/core';
import { base64ToBytes, parseDataUri, probeImage } from './probe.js';
import { StorageError, type StorageAdapter } from './storage.js';

/**
 * The ingestion pipeline.
 *
 * This is the machine that was missing: the document model has always had
 * `Asset` and an `addAsset` operation, but nothing produced them. Everything
 * that can introduce an image — a drop, a paste, a URL, a model that just
 * generated one — funnels through here and comes out the far side as
 * *operations*, so an upload lands in the undo stack like any other edit.
 *
 *   bytes ──► probe (dimensions, MIME) ──► storage adapter ──► Asset ──► ops
 */

export interface IngestInput {
  name: string;
  bytes: Uint8Array;
  /** Declared type; the probe overrides it when the header disagrees. */
  mimeType?: string;
  alt?: string;
  /** Set for generated images so the prompt survives with the asset. */
  prompt?: string;
  generatedBy?: string;
}

export interface IngestResult {
  asset: Asset;
  operations: Operation[];
}

export interface IngestorOptions {
  storage: StorageAdapter;
  /** Rejects anything larger, before touching storage. */
  maxBytes?: number;
  /** Extra MIME types to accept beyond the image formats we can probe. */
  allowedMimeTypes?: string[];
}

const IMAGE_MIME_TO_KIND: Record<string, AssetKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/svg+xml': 'svg',
};

export class AssetIngestor {
  private readonly storage: StorageAdapter;
  private readonly maxBytes: number;
  private readonly allowed: Set<string>;

  constructor(options: IngestorOptions) {
    this.storage = options.storage;
    this.maxBytes = options.maxBytes ?? 12 * 1024 * 1024;
    this.allowed = new Set([
      ...Object.keys(IMAGE_MIME_TO_KIND),
      'video/mp4',
      'video/webm',
      'font/woff2',
      'font/woff',
      ...(options.allowedMimeTypes ?? []),
    ]);
  }

  get storageLabel(): string {
    return this.storage.label;
  }

  /** Probes, stores, and returns the asset plus the operation that records it. */
  async ingest(input: IngestInput): Promise<IngestResult> {
    if (input.bytes.byteLength === 0) {
      throw new StorageError(`"${input.name}" is empty`);
    }
    if (input.bytes.byteLength > this.maxBytes) {
      throw new StorageError(
        `"${input.name}" is ${(input.bytes.byteLength / 1024 / 1024).toFixed(1)} MB, over the ${(
          this.maxBytes /
          1024 /
          1024
        ).toFixed(0)} MB limit`,
      );
    }

    const probed = probeImage(input.bytes);
    // The header is authoritative. A browser will happily report `image/png`
    // for a renamed JPEG, and a wrong MIME type breaks rendering downstream.
    const mimeType = probed?.mimeType ?? input.mimeType ?? 'application/octet-stream';

    if (!this.allowed.has(mimeType)) {
      throw new StorageError(
        `"${input.name}" has unsupported type ${mimeType}. Allowed: ${[...this.allowed].join(', ')}`,
      );
    }

    const stored = await this.storage.put({ bytes: input.bytes, mimeType, name: input.name });

    const asset: Asset = {
      id: createId('asset'),
      kind: classify(mimeType, input.name),
      name: input.name,
      url: stored.url,
      size: stored.size,
      mimeType,
      createdAt: new Date().toISOString(),
      ...(probed && probed.width > 0 ? { width: probed.width, height: probed.height } : {}),
      ...(input.alt ? { alt: input.alt } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.generatedBy ? { generatedBy: input.generatedBy } : {}),
    };

    return { asset, operations: [{ type: 'addAsset', asset }] };
  }

  /** Ingests a browser `File`/`Blob`. */
  async ingestFile(file: File | Blob, overrides: Partial<IngestInput> = {}): Promise<IngestResult> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = overrides.name ?? ('name' in file && file.name ? file.name : 'untitled');
    return this.ingest({ ...overrides, name, bytes, mimeType: overrides.mimeType ?? file.type });
  }

  /** Ingests base64 (with or without a `data:` prefix) — the generation path. */
  async ingestBase64(base64: string, input: Omit<IngestInput, 'bytes'>): Promise<IngestResult> {
    const parsed = parseDataUri(base64);
    const bytes = parsed?.bytes ?? base64ToBytes(base64);
    return this.ingest({ ...input, bytes, mimeType: parsed?.mimeType ?? input.mimeType });
  }

  /**
   * Fetches a remote URL and re-hosts it.
   *
   * Re-hosting rather than referencing is the point: a generated image URL from
   * a model provider expires, often within the hour, and a project full of dead
   * links is worse than one that refused the import.
   */
  async ingestUrl(
    url: string,
    input: Partial<Omit<IngestInput, 'bytes'>> = {},
    fetchImpl: typeof fetch = globalThis.fetch,
  ): Promise<IngestResult> {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new StorageError(`could not fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const name = input.name ?? guessNameFromUrl(url);

    return this.ingest({
      ...input,
      name,
      bytes,
      mimeType: input.mimeType ?? response.headers.get('content-type')?.split(';')[0] ?? undefined,
    });
  }
}

function classify(mimeType: string, name: string): AssetKind {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('font/')) return 'font';

  const kind = IMAGE_MIME_TO_KIND[mimeType];
  if (!kind) return 'image';

  // A small SVG named "logo" is a logo as far as the library is concerned;
  // categorisation only affects how it is grouped in the panel.
  if (kind === 'svg' && /logo|mark|brand/i.test(name)) return 'logo';
  if (kind === 'svg' && /icon/i.test(name)) return 'icon';
  return kind;
}

function guessNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? 'image');
  } catch {
    return 'image';
  }
}

/* -------------------------------------------------------------------------- */
/*                      Placing an asset on the canvas                        */
/* -------------------------------------------------------------------------- */

export interface PlaceAssetOptions {
  parentId: NodeId;
  index?: number;
  /** Caps the node's width; the height follows the intrinsic aspect ratio. */
  maxWidth?: number;
}

/**
 * Builds the node that displays an asset.
 *
 * Two details that only look small: the intrinsic `aspectRatio` is baked in so
 * the layout does not shift when the bytes load, and `alt` is seeded from the
 * asset so the accessibility review does not immediately flag the new node.
 */
export function createAssetNode(asset: Asset, options: { maxWidth?: number } = {}): SceneNode {
  const isVideo = asset.kind === 'video';
  const maxWidth = options.maxWidth ?? 640;

  const width = asset.width && asset.width > 0 ? Math.min(asset.width, maxWidth) : 'fill';

  return {
    id: createId(),
    type: isVideo ? 'video' : 'image',
    name: asset.name,
    parent: null,
    children: [],
    props: {
      src: asset.url,
      ...(isVideo ? { controls: true } : { alt: asset.alt ?? deriveAlt(asset) }),
    },
    style: {
      width,
      ...(asset.width && asset.height && asset.width > 0
        ? { aspectRatio: `${asset.width}/${asset.height}` }
        : {}),
      radius: '{radius.lg}',
      overflow: 'hidden',
    },
    meta: { assetId: asset.id },
  };
}

/** Operations that place an asset onto the canvas. */
export function placeAsset(asset: Asset, options: PlaceAssetOptions): Operation[] {
  const node = createAssetNode(asset, options.maxWidth ? { maxWidth: options.maxWidth } : {});
  return [
    {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: options.parentId,
      index: options.index ?? 0,
    },
  ];
}

/**
 * Falls back to the file name when no alt text exists.
 *
 * Not a substitute for real alt text — the review pass still nudges for
 * something meaningful — but "hero photo" beats an empty attribute.
 */
function deriveAlt(asset: Asset): string {
  if (asset.prompt) return asset.prompt.slice(0, 120);
  return asset.name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

/** Assets referenced by no node — what an "unused assets" cleanup would offer. */
export function findOrphanAssets(document: DesignDocument): Asset[] {
  const used = new Set<string>();

  for (const node of Object.values(document.nodes)) {
    const src = node.props.src;
    if (typeof src === 'string') used.add(src);
    const assetId = node.meta?.assetId;
    if (typeof assetId === 'string') used.add(assetId);
  }

  return document.assets.filter((asset) => !used.has(asset.url) && !used.has(asset.id));
}
