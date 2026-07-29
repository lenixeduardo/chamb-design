import { describe, expect, it, vi } from 'vitest';
import {
  applyOperations,
  createDocument,
  createNode,
  seededRng,
  setIdRng,
  validateDocumentIntegrity,
} from '@opendesign/core';
import {
  AssetIngestor,
  DataUriStorage,
  HttpStorage,
  MemoryStorage,
  StorageError,
  base64ToBytes,
  bytesToBase64,
  createAssetNode,
  findOrphanAssets,
  parseDataUri,
  placeAsset,
  probeImage,
  sanitizeFileName,
  toDataUri,
} from '../index.js';

/* ----------------------------- fixtures ------------------------------ */

/** A minimal but structurally valid PNG header declaring 120x80. */
function png(width = 120, height = 80): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes[16] = (width >> 24) & 0xff;
  bytes[17] = (width >> 16) & 0xff;
  bytes[18] = (width >> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >> 24) & 0xff;
  bytes[21] = (height >> 16) & 0xff;
  bytes[22] = (height >> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

/** A JPEG with an APP0 segment before the SOF0, so segment skipping matters. */
function jpeg(width = 300, height = 200): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof0 = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    ...new Array(8).fill(0),
  ];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
}

function gif(width = 64, height = 32): Uint8Array {
  const bytes = new Uint8Array(13);
  bytes.set(new TextEncoder().encode('GIF89a'), 0);
  bytes[6] = width & 0xff;
  bytes[7] = (width >> 8) & 0xff;
  bytes[8] = height & 0xff;
  bytes[9] = (height >> 8) & 0xff;
  return bytes;
}

function webpLossy(width = 200, height = 150): Uint8Array {
  const bytes = new Uint8Array(32);
  const enc = new TextEncoder();
  bytes.set(enc.encode('RIFF'), 0);
  bytes.set(enc.encode('WEBP'), 8);
  bytes.set(enc.encode('VP8 '), 12);
  bytes[26] = width & 0xff;
  bytes[27] = (width >> 8) & 0x3f;
  bytes[28] = height & 0xff;
  bytes[29] = (height >> 8) & 0x3f;
  return bytes;
}

const svg = (body: string) => new TextEncoder().encode(body);

/* ------------------------------- probe -------------------------------- */

describe('probeImage', () => {
  it('reads PNG dimensions', () => {
    expect(probeImage(png(1200, 630))).toEqual({
      mimeType: 'image/png',
      width: 1200,
      height: 630,
    });
  });

  it('walks past JPEG segments to the start-of-frame', () => {
    expect(probeImage(jpeg(1920, 1080))).toEqual({
      mimeType: 'image/jpeg',
      width: 1920,
      height: 1080,
    });
  });

  it('reads GIF little-endian dimensions', () => {
    expect(probeImage(gif(300, 100))).toEqual({
      mimeType: 'image/gif',
      width: 300,
      height: 100,
    });
  });

  it('reads lossy WebP dimensions', () => {
    expect(probeImage(webpLossy(640, 480))).toEqual({
      mimeType: 'image/webp',
      width: 640,
      height: 480,
    });
  });

  it('prefers explicit SVG width and height', () => {
    expect(
      probeImage(svg('<svg width="48" height="24" xmlns="http://www.w3.org/2000/svg"/>')),
    ).toEqual({ mimeType: 'image/svg+xml', width: 48, height: 24, scalable: true });
  });

  it('falls back to the SVG viewBox', () => {
    expect(
      probeImage(svg('<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg"/>')),
    ).toEqual({ mimeType: 'image/svg+xml', width: 100, height: 50, scalable: true });
  });

  it('returns null for bytes that are not an image', () => {
    expect(probeImage(new TextEncoder().encode('just some text'))).toBeNull();
  });

  it('does not crash on truncated input', () => {
    expect(probeImage(png().subarray(0, 6))).toBeNull();
    expect(probeImage(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    for (const length of [0, 1, 2, 3, 17, 256]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) bytes[i] = (i * 37) % 256;
      expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
    }
  });

  it('round-trips through a data URI', () => {
    const bytes = png(10, 20);
    const parsed = parseDataUri(toDataUri(bytes, 'image/png'))!;
    expect(parsed.mimeType).toBe('image/png');
    expect([...parsed.bytes]).toEqual([...bytes]);
  });

  it('tolerates whitespace and a data prefix on input', () => {
    const clean = bytesToBase64(png());
    const messy = `data:image/png;base64,${clean.slice(0, 8)}\n  ${clean.slice(8)}`;
    expect([...base64ToBytes(messy)]).toEqual([...png()]);
  });
});

/* ------------------------------ storage ------------------------------- */

describe('DataUriStorage', () => {
  it('inlines bytes as a data URI', async () => {
    const stored = await new DataUriStorage().put({
      bytes: png(),
      mimeType: 'image/png',
      name: 'a.png',
    });
    expect(stored.url.startsWith('data:image/png;base64,')).toBe(true);
    expect(stored.size).toBe(24);
  });

  it('refuses files over the inline cap, with an actionable message', async () => {
    const storage = new DataUriStorage(10);
    await expect(
      storage.put({ bytes: png(), mimeType: 'image/png', name: 'big.png' }),
    ).rejects.toThrow(/capped at 10 B.*storage adapter/s);
  });
});

describe('HttpStorage', () => {
  it('posts multipart form data and uses the returned url', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ url: '/assets/x.png' }), { status: 200 }));

    const storage = new HttpStorage('/api/assets', { fetch: fetchMock as unknown as typeof fetch });
    const stored = await storage.put({ bytes: png(), mimeType: 'image/png', name: 'x.png' });

    expect(stored.url).toBe('/assets/x.png');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/assets');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('surfaces an upload failure with its status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('nope', { status: 413 }));
    const storage = new HttpStorage('/api/assets', { fetch: fetchMock as unknown as typeof fetch });

    await expect(
      storage.put({ bytes: png(), mimeType: 'image/png', name: 'x.png' }),
    ).rejects.toThrow(/413/);
  });

  it('fails clearly when the endpoint returns no url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const storage = new HttpStorage('/api/assets', { fetch: fetchMock as unknown as typeof fetch });

    await expect(
      storage.put({ bytes: png(), mimeType: 'image/png', name: 'x.png' }),
    ).rejects.toThrow(/did not return a \{ url \} payload/);
  });
});

describe('sanitizeFileName', () => {
  it('strips traversal attempts and path separators', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('a/b/c/photo (1).PNG')).toBe('photo-1-.PNG');
    expect(sanitizeFileName('....')).toBe('file');
    expect(sanitizeFileName('')).toBe('file');
  });
});

/* ------------------------------ ingestion ----------------------------- */

function makeIngestor(maxBytes?: number) {
  const storage = new MemoryStorage();
  return {
    storage,
    ingestor: new AssetIngestor(maxBytes ? { storage, maxBytes } : { storage }),
  };
}

describe('AssetIngestor', () => {
  it('probes, stores, and emits an addAsset operation', async () => {
    const { ingestor, storage } = makeIngestor();
    const { asset, operations } = await ingestor.ingest({
      name: 'hero.png',
      bytes: png(1200, 630),
    });

    expect(asset).toMatchObject({
      kind: 'image',
      name: 'hero.png',
      mimeType: 'image/png',
      width: 1200,
      height: 630,
      size: 24,
    });
    expect(operations).toEqual([{ type: 'addAsset', asset }]);
    expect(storage.objects.size).toBe(1);
  });

  it('trusts the file header over the declared MIME type', async () => {
    const { ingestor } = makeIngestor();
    // A JPEG that claims to be a PNG — browsers do this with renamed files.
    const { asset } = await ingestor.ingest({
      name: 'mislabelled.png',
      bytes: jpeg(800, 600),
      mimeType: 'image/png',
    });
    expect(asset.mimeType).toBe('image/jpeg');
  });

  it('rejects empty and oversized files before touching storage', async () => {
    const { ingestor, storage } = makeIngestor(10);

    await expect(ingestor.ingest({ name: 'empty.png', bytes: new Uint8Array(0) })).rejects.toThrow(
      /is empty/,
    );
    await expect(ingestor.ingest({ name: 'big.png', bytes: png() })).rejects.toThrow(/over the/);

    expect(storage.objects.size).toBe(0);
  });

  it('rejects an unsupported type', async () => {
    const { ingestor } = makeIngestor();
    await expect(
      ingestor.ingest({
        name: 'evil.exe',
        bytes: new TextEncoder().encode('MZ binary'),
        mimeType: 'application/x-msdownload',
      }),
    ).rejects.toThrow(StorageError);
  });

  it('classifies svg logos and icons by name', async () => {
    const { ingestor } = makeIngestor();
    const logo = await ingestor.ingest({
      name: 'brand-logo.svg',
      bytes: svg('<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"/>'),
    });
    const icon = await ingestor.ingest({
      name: 'icon-check.svg',
      bytes: svg('<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"/>'),
    });

    expect(logo.asset.kind).toBe('logo');
    expect(icon.asset.kind).toBe('icon');
  });

  it('ingests base64 from a generation response, keeping the prompt', async () => {
    const { ingestor } = makeIngestor();
    const { asset } = await ingestor.ingestBase64(bytesToBase64(png(1024, 1024)), {
      name: 'generated.png',
      prompt: 'a red dinosaur mascot, flat vector',
      generatedBy: 'openai-images',
    });

    expect(asset.prompt).toBe('a red dinosaur mascot, flat vector');
    expect(asset.generatedBy).toBe('openai-images');
    expect(asset.width).toBe(1024);
  });

  it('re-hosts a remote url instead of referencing it', async () => {
    const bytes = png(500, 500);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } }),
      );

    const { ingestor, storage } = makeIngestor();
    const { asset } = await ingestor.ingestUrl(
      'https://cdn.example.com/tmp/expiring-abc123.png?token=x',
      {},
      fetchMock as unknown as typeof fetch,
    );

    expect(asset.name).toBe('expiring-abc123.png');
    // The stored url is ours, not the expiring one.
    expect(asset.url.startsWith('memory://')).toBe(true);
    expect(storage.objects.size).toBe(1);
  });

  it('reports a failed fetch clearly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('gone', { status: 404 }));
    const { ingestor } = makeIngestor();

    await expect(
      ingestor.ingestUrl('https://x.test/a.png', {}, fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/could not fetch.*404/);
  });

  it('ingests a Blob', async () => {
    const { ingestor } = makeIngestor();
    const blob = new Blob([new Uint8Array(png(64, 64)).buffer], { type: 'image/png' });
    const { asset } = await ingestor.ingestFile(blob, { name: 'from-blob.png' });
    expect(asset.width).toBe(64);
  });
});

/* --------------------------- document wiring -------------------------- */

describe('placing assets in a document', () => {
  it('applies cleanly and leaves the document valid', async () => {
    setIdRng(seededRng(99));
    const doc = createDocument({ name: 'Assets' });
    const rootId = doc.pages[0]!.rootId;

    const { ingestor } = makeIngestor();
    const { asset, operations } = await ingestor.ingest({
      name: 'photo.png',
      bytes: png(800, 400),
    });

    const withAsset = applyOperations(doc, operations).document;
    expect(withAsset.assets).toHaveLength(1);

    const placed = applyOperations(withAsset, placeAsset(asset, { parentId: rootId })).document;

    const integrity = validateDocumentIntegrity(placed);
    expect(integrity.errors).toEqual([]);

    const node = Object.values(placed.nodes).find((n) => n.type === 'image')!;
    expect(node.props.src).toBe(asset.url);
    expect(node.style.aspectRatio).toBe('800/400');
    expect(node.meta?.assetId).toBe(asset.id);
  });

  it('bakes in the intrinsic aspect ratio and caps the width', () => {
    const node = createAssetNode(
      {
        id: 'a1',
        kind: 'image',
        name: 'wide.png',
        url: 'memory://1',
        width: 3000,
        height: 1000,
        createdAt: new Date().toISOString(),
      },
      { maxWidth: 640 },
    );

    expect(node.style.width).toBe(640);
    expect(node.style.aspectRatio).toBe('3000/1000');
  });

  it('derives alt text so the accessibility review does not fire immediately', () => {
    const fromName = createAssetNode({
      id: 'a2',
      kind: 'image',
      name: 'team-photo_2024.jpg',
      url: 'memory://2',
      createdAt: new Date().toISOString(),
    });
    expect(fromName.props.alt).toBe('team photo 2024');

    const fromPrompt = createAssetNode({
      id: 'a3',
      kind: 'image',
      name: 'gen.png',
      url: 'memory://3',
      prompt: 'a friendly red dinosaur waving',
      createdAt: new Date().toISOString(),
    });
    expect(fromPrompt.props.alt).toBe('a friendly red dinosaur waving');
  });

  it('uses fill width when the dimensions are unknown', () => {
    const node = createAssetNode({
      id: 'a4',
      kind: 'svg',
      name: 'mark.svg',
      url: 'memory://4',
      width: 0,
      height: 0,
      createdAt: new Date().toISOString(),
    });
    expect(node.style.width).toBe('fill');
    expect(node.style.aspectRatio).toBeUndefined();
  });

  it('finds assets no node references', async () => {
    setIdRng(seededRng(5));
    let doc = createDocument();
    const rootId = doc.pages[0]!.rootId;

    const { ingestor } = makeIngestor();
    const used = await ingestor.ingest({ name: 'used.png', bytes: png() });
    const unused = await ingestor.ingest({ name: 'unused.png', bytes: png() });

    doc = applyOperations(doc, [...used.operations, ...unused.operations]).document;
    doc = applyOperations(doc, placeAsset(used.asset, { parentId: rootId })).document;

    expect(findOrphanAssets(doc).map((a) => a.name)).toEqual(['unused.png']);
  });

  it('counts an asset referenced only by src as used', () => {
    setIdRng(seededRng(6));
    let doc = createDocument();
    const rootId = doc.pages[0]!.rootId;

    const asset = {
      id: 'a5',
      kind: 'image' as const,
      name: 'manual.png',
      url: 'https://cdn.test/manual.png',
      createdAt: new Date().toISOString(),
    };

    const node = createNode({ type: 'image', props: { src: asset.url, alt: 'manual' } });
    doc = applyOperations(doc, [
      { type: 'addAsset', asset },
      { type: 'insertSubtree', nodes: [node], rootId: node.id, parentId: rootId, index: 0 },
    ]).document;

    expect(findOrphanAssets(doc)).toEqual([]);
  });
});
