import { describe, expect, it, vi } from 'vitest';
import {
  PluginRegistry,
  applyOperations,
  createDocument,
  seededRng,
  setIdRng,
} from '@opendesign/core';
import { AssetIngestor, MemoryStorage, bytesToBase64 } from '@opendesign/assets';
import {
  aiProvidersPlugin,
  createImageProvider,
  createOpenAIImageProvider,
  generateAndIngest,
  googleImageProvider,
  listImageProviders,
  localImageProvider,
  slugifyPrompt,
} from '../index.js';

/** A structurally valid 512x256 PNG header, as base64. */
function pngBase64(width = 512, height = 256): string {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  b[16] = (width >> 24) & 0xff;
  b[17] = (width >> 16) & 0xff;
  b[18] = (width >> 8) & 0xff;
  b[19] = width & 0xff;
  b[20] = (height >> 24) & 0xff;
  b[21] = (height >> 16) & 0xff;
  b[22] = (height >> 8) & 0xff;
  b[23] = height & 0xff;
  return bytesToBase64(b);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('registry integration', () => {
  it('registers image providers through their own contribution point', async () => {
    const registry = new PluginRegistry();
    await registry.register(aiProvidersPlugin);

    const ids = registry
      .getImageProviders()
      .map((p) => p.id)
      .sort();
    expect(ids).toEqual(['google-images', 'local-images', 'openai-images']);

    // Chat providers are untouched by the addition.
    expect(registry.getAIProviders()).toHaveLength(7);
  });

  it('lists providers without needing credentials', () => {
    const listed = listImageProviders();
    expect(listed.find((p) => p.id === 'local-images')?.locality).toBe('local');
    expect(listed.every((p) => p.models.length > 0)).toBe(true);
  });

  it('rejects an unknown provider id with the available list', () => {
    expect(() => createImageProvider('nope')).toThrow(/unknown image provider "nope". Available:/);
  });
});

describe('OpenAI images', () => {
  it('requests base64 rather than a url, because hosted urls expire', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ b64_json: pngBase64() }] }));
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await provider.generate({ prompt: 'a red dinosaur', model: 'gpt-image-1', size: '1536x1024' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/images/generations');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'a red dinosaur',
      size: '1536x1024',
      response_format: 'b64_json',
    });
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer k' });
  });

  it('returns every image and surfaces a revised prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        data: [
          { b64_json: pngBase64(), revised_prompt: 'a friendly red dinosaur, flat vector' },
          { b64_json: pngBase64() },
        ],
      }),
    );

    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const images = await provider.generate({ prompt: 'dino', model: 'gpt-image-1', count: 2 });

    expect(images).toHaveLength(2);
    expect(images[0]!.revisedPrompt).toBe('a friendly red dinosaur, flat vector');
    expect(images[0]!.mimeType).toBe('image/png');
  });

  it('fails clearly when the response has no bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ url: 'https://x/y.png' }] }));
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.generate({ prompt: 'x', model: 'gpt-image-1' })).rejects.toThrow(
      /no base64 image data/,
    );
  });

  it('surfaces an upstream error with its status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('slow down', { status: 429 }));
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.generate({ prompt: 'x', model: 'gpt-image-1' })).rejects.toThrow(/429/);
  });

  it('requires a key for the cloud provider and not for the local one', async () => {
    await expect(
      createOpenAIImageProvider({}).generate({ prompt: 'x', model: 'gpt-image-1' }),
    ).rejects.toThrow(/missing API key/);

    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ b64_json: pngBase64() }] }));
    const local = localImageProvider({ fetch: fetchMock as unknown as typeof fetch });

    await expect(local.generate({ prompt: 'x', model: 'stable-diffusion' })).resolves.toHaveLength(
      1,
    );
    expect(fetchMock.mock.calls[0]![0]).toContain('localhost:8080');
  });
});

describe('Google Imagen', () => {
  it('uses the predict shape and converts a pixel size to an aspect ratio', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ predictions: [{ bytesBase64Encoded: pngBase64() }] }));

    const provider = googleImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await provider.generate({
      prompt: 'a cream studio',
      model: 'imagen-4.0-generate-001',
      size: '1792x1024',
      negativePrompt: 'text, watermark',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain(':predict');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.instances).toEqual([{ prompt: 'a cream studio' }]);
    // 1792x1024 is 1.75 — closest supported ratio is 16:9.
    expect(body.parameters.aspectRatio).toBe('16:9');
    expect(body.parameters.negativePrompt).toBe('text, watermark');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'k' });
  });

  it('maps common sizes to the nearest supported ratio', async () => {
    const cases: [string, string][] = [
      ['1024x1024', '1:1'],
      ['1024x1792', '9:16'],
      ['1200x900', '4:3'],
      ['900x1200', '3:4'],
    ];

    for (const [size, expected] of cases) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(json({ predictions: [{ bytesBase64Encoded: pngBase64() }] }));
      const provider = googleImageProvider({
        apiKey: 'k',
        fetch: fetchMock as unknown as typeof fetch,
      });

      await provider.generate({ prompt: 'x', model: 'imagen-4.0-generate-001', size });
      const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
      expect(body.parameters.aspectRatio).toBe(expected);
    }
  });

  it('fails clearly on an empty prediction list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ predictions: [] }));
    const provider = googleImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      provider.generate({ prompt: 'x', model: 'imagen-4.0-generate-001' }),
    ).rejects.toThrow(/no predictions/);
  });
});

describe('generateAndIngest', () => {
  function setup() {
    const storage = new MemoryStorage();
    return { storage, ingestor: new AssetIngestor({ storage }) };
  }

  it('turns generated bytes into assets and operations that apply cleanly', async () => {
    setIdRng(seededRng(123));
    const { ingestor, storage } = setup();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ data: [{ b64_json: pngBase64(1024, 512) }] }));
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { assets, operations } = await generateAndIngest(provider, ingestor, {
      prompt: 'a friendly red dinosaur mascot on cream',
      model: 'gpt-image-1',
    });

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      width: 1024,
      height: 512,
      mimeType: 'image/png',
      generatedBy: 'openai-images',
      prompt: 'a friendly red dinosaur mascot on cream',
    });
    // The file name is derived from the prompt so the panel is scannable.
    expect(assets[0]!.name).toBe('a-friendly-red-dinosaur-mascot-on.png');

    // Bytes were re-hosted by the adapter, not left as a provider url.
    expect(assets[0]!.url.startsWith('memory://')).toBe(true);
    expect(storage.objects.size).toBe(1);

    const document = applyOperations(createDocument(), operations).document;
    expect(document.assets).toHaveLength(1);
  });

  it('prefers the provider’s revised prompt when it rewrites the input', async () => {
    const { ingestor } = setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json({ data: [{ b64_json: pngBase64(), revised_prompt: 'expanded description' }] }),
      );
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { assets } = await generateAndIngest(provider, ingestor, {
      prompt: 'short',
      model: 'gpt-image-1',
    });

    expect(assets[0]!.prompt).toBe('expanded description');
    // Alt text keeps the user's wording, which is what they actually meant.
    expect(assets[0]!.alt).toBe('short');
  });

  it('numbers multiple results', async () => {
    const { ingestor } = setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json({ data: [{ b64_json: pngBase64() }, { b64_json: pngBase64() }] }));
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { assets } = await generateAndIngest(provider, ingestor, {
      prompt: 'variants',
      model: 'gpt-image-1',
      count: 2,
      name: 'hero',
    });

    expect(assets.map((a) => a.name)).toEqual(['hero-1.png', 'hero-2.png']);
  });

  it('propagates a storage rejection instead of half-recording an asset', async () => {
    const storage = new MemoryStorage();
    const ingestor = new AssetIngestor({ storage, maxBytes: 4 });

    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ b64_json: pngBase64() }] }));
    const provider = createOpenAIImageProvider({
      apiKey: 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(
      generateAndIngest(provider, ingestor, { prompt: 'x', model: 'gpt-image-1' }),
    ).rejects.toThrow(/over the/);
    expect(storage.objects.size).toBe(0);
  });
});

describe('slugifyPrompt', () => {
  it('caps length and strips punctuation', () => {
    expect(slugifyPrompt('A friendly, red dinosaur mascot waving on a cream background!')).toBe(
      'a-friendly-red-dinosaur-mascot-waving',
    );
    expect(slugifyPrompt('!!!')).toBe('generated');
  });
});
