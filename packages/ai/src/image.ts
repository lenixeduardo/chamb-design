import type { Asset, Operation } from '@opendesign/core';
import type { AssetIngestor } from '@opendesign/assets';
import { assertOk, ProviderError, type ProviderConfig } from './provider.js';

/**
 * Image generation.
 *
 * A separate interface from `ChatProvider` on purpose: chat streams tokens and
 * is judged on latency-to-first-byte, image generation returns bytes once and is
 * judged on whether the bytes arrive at all. Folding them into one interface
 * would produce a type where half the members are always unused.
 *
 * Every provider returns **base64**, never a URL — see `generateAndIngest`.
 */

export interface ImageRequest {
  prompt: string;
  model: string;
  /** `1024x1024`, `1536x1024`, … Providers clamp to what they support. */
  size?: string;
  count?: number;
  /** Steer away from unwanted content. Ignored by providers without support. */
  negativePrompt?: string;
  signal?: AbortSignal;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
  /** Prompt the provider actually used, when it rewrites the input. */
  revisedPrompt?: string;
}

export interface ImageModelInfo {
  id: string;
  label: string;
  sizes?: string[];
}

export interface ImageProvider {
  readonly id: string;
  readonly label: string;
  readonly locality: 'cloud' | 'local';
  readonly models: ImageModelInfo[];
  generate(request: ImageRequest): Promise<GeneratedImage[]>;
}

/* -------------------------------------------------------------------------- */
/*                            OpenAI-shaped images                            */
/* -------------------------------------------------------------------------- */

export interface OpenAIImageOptions extends ProviderConfig {
  id?: string;
  label?: string;
  locality?: 'cloud' | 'local';
  defaultBaseUrl?: string;
  models?: ImageModelInfo[];
  requiresApiKey?: boolean;
}

/**
 * `POST /images/generations`.
 *
 * `response_format: b64_json` is not a preference — OpenAI's hosted URLs expire
 * within the hour, and a project full of dead image links is worse than one
 * that refused the import. Asking for bytes means we can re-host immediately.
 */
export function createOpenAIImageProvider(options: OpenAIImageOptions = {}): ImageProvider {
  const {
    id = 'openai-images',
    label = 'OpenAI Images',
    locality = 'cloud',
    defaultBaseUrl = 'https://api.openai.com/v1',
    requiresApiKey = true,
    apiKey,
    baseUrl,
    headers,
    fetch: fetchImpl,
    models = [
      { id: 'gpt-image-1', label: 'GPT Image 1', sizes: ['1024x1024', '1536x1024', '1024x1536'] },
      { id: 'dall-e-3', label: 'DALL·E 3', sizes: ['1024x1024', '1792x1024', '1024x1792'] },
    ],
  } = options;

  const doFetch = fetchImpl ?? globalThis.fetch;
  const endpoint = `${(baseUrl ?? defaultBaseUrl).replace(/\/$/, '')}/images/generations`;

  return {
    id,
    label,
    locality,
    models,

    async generate(request) {
      if (requiresApiKey && !apiKey) throw new ProviderError('missing API key', id);

      const response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...headers,
        },
        body: JSON.stringify({
          model: request.model,
          prompt: request.prompt,
          n: request.count ?? 1,
          size: request.size ?? '1024x1024',
          response_format: 'b64_json',
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      await assertOk(response, id);

      const payload = (await response.json()) as {
        data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
      };

      const images: GeneratedImage[] = [];
      for (const entry of payload.data ?? []) {
        if (!entry.b64_json) continue;
        images.push({
          base64: entry.b64_json,
          mimeType: 'image/png',
          ...(entry.revised_prompt ? { revisedPrompt: entry.revised_prompt } : {}),
        });
      }

      if (images.length === 0) {
        throw new ProviderError('response contained no base64 image data', id);
      }
      return images;
    },
  };
}

/**
 * Local image servers.
 *
 * LocalAI, and most ComfyUI/Automatic1111 front-ends, expose the OpenAI images
 * shape on localhost without auth — so this is the same adapter with the key
 * requirement dropped.
 */
export function localImageProvider(config: ProviderConfig = {}): ImageProvider {
  return createOpenAIImageProvider({
    ...config,
    id: 'local-images',
    label: 'Local image server',
    locality: 'local',
    requiresApiKey: false,
    defaultBaseUrl: 'http://localhost:8080/v1',
    models: [{ id: 'stable-diffusion', label: 'Loaded model', sizes: ['512x512', '1024x1024'] }],
  });
}

/* -------------------------------------------------------------------------- */
/*                                Google Imagen                               */
/* -------------------------------------------------------------------------- */

/**
 * Google's Imagen, via `:predict`.
 *
 * Different enough from the OpenAI shape to warrant its own adapter: requests
 * are `instances`/`parameters`, and the bytes come back as
 * `bytesBase64Encoded` rather than `b64_json`.
 */
export function googleImageProvider(config: ProviderConfig = {}): ImageProvider {
  const doFetch = config.fetch ?? globalThis.fetch;
  const baseUrl = (config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/$/,
    '',
  );

  return {
    id: 'google-images',
    label: 'Imagen (Google)',
    locality: 'cloud',
    models: [
      { id: 'imagen-4.0-generate-001', label: 'Imagen 4', sizes: ['1024x1024'] },
      { id: 'imagen-4.0-fast-generate-001', label: 'Imagen 4 Fast', sizes: ['1024x1024'] },
    ],

    async generate(request) {
      if (!config.apiKey) throw new ProviderError('missing API key', 'google-images');

      const response = await doFetch(
        `${baseUrl}/models/${encodeURIComponent(request.model)}:predict`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': config.apiKey,
            ...config.headers,
          },
          body: JSON.stringify({
            instances: [{ prompt: request.prompt }],
            parameters: {
              sampleCount: request.count ?? 1,
              ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
              ...(request.size ? { aspectRatio: sizeToAspectRatio(request.size) } : {}),
            },
          }),
          ...(request.signal ? { signal: request.signal } : {}),
        },
      );

      await assertOk(response, 'google-images');

      const payload = (await response.json()) as {
        predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
      };

      const images: GeneratedImage[] = [];
      for (const prediction of payload.predictions ?? []) {
        if (!prediction.bytesBase64Encoded) continue;
        images.push({
          base64: prediction.bytesBase64Encoded,
          mimeType: prediction.mimeType ?? 'image/png',
        });
      }

      if (images.length === 0) {
        throw new ProviderError('response contained no predictions', 'google-images');
      }
      return images;
    },
  };
}

/** Imagen takes an aspect ratio rather than a pixel size. */
function sizeToAspectRatio(size: string): string {
  const [width, height] = size.split('x').map(Number);
  if (!width || !height) return '1:1';

  const ratio = width / height;
  const candidates: [string, number][] = [
    ['1:1', 1],
    ['3:4', 0.75],
    ['4:3', 4 / 3],
    ['9:16', 0.5625],
    ['16:9', 16 / 9],
  ];

  return candidates.reduce((best, current) =>
    Math.abs(current[1] - ratio) < Math.abs(best[1] - ratio) ? current : best,
  )[0];
}

/* -------------------------------------------------------------------------- */
/*                              The full machine                              */
/* -------------------------------------------------------------------------- */

export const IMAGE_PROVIDER_FACTORIES: Record<string, (config?: ProviderConfig) => ImageProvider> =
  {
    'openai-images': (config = {}) => createOpenAIImageProvider(config),
    'google-images': googleImageProvider,
    'local-images': localImageProvider,
  };

export function createImageProvider(id: string, config: ProviderConfig = {}): ImageProvider {
  const factory = IMAGE_PROVIDER_FACTORIES[id];
  if (!factory) {
    throw new Error(
      `[opendesign:ai] unknown image provider "${id}". Available: ${Object.keys(
        IMAGE_PROVIDER_FACTORIES,
      ).join(', ')}`,
    );
  }
  return factory(config);
}

export function listImageProviders(): {
  id: string;
  label: string;
  locality: 'cloud' | 'local';
  models: ImageModelInfo[];
}[] {
  return Object.entries(IMAGE_PROVIDER_FACTORIES).map(([id, factory]) => {
    const provider = factory({});
    return {
      id,
      label: provider.label,
      locality: provider.locality,
      models: provider.models,
    };
  });
}

export interface GenerateAndIngestResult {
  assets: Asset[];
  operations: Operation[];
}

/**
 * Generation to document, in one call.
 *
 * This is the join that makes generated images actually usable: the provider's
 * bytes go straight into the ingestor, so they get probed for dimensions,
 * stored by whichever adapter is configured, and turned into `addAsset`
 * operations. The prompt rides along on the asset, so a later "same thing but
 * wider" has something to work from.
 *
 * Nothing here ever persists a provider URL. Those expire.
 */
export async function generateAndIngest(
  provider: ImageProvider,
  ingestor: AssetIngestor,
  request: ImageRequest & { name?: string },
): Promise<GenerateAndIngestResult> {
  const images = await provider.generate(request);

  const assets: Asset[] = [];
  const operations: Operation[] = [];

  for (const [index, image] of images.entries()) {
    const suffix = images.length > 1 ? `-${index + 1}` : '';
    const base = request.name ?? slugifyPrompt(request.prompt);

    const result = await ingestor.ingestBase64(image.base64, {
      name: `${base}${suffix}.${extensionFor(image.mimeType)}`,
      mimeType: image.mimeType,
      prompt: image.revisedPrompt ?? request.prompt,
      generatedBy: provider.id,
      alt: request.prompt,
    });

    assets.push(result.asset);
    operations.push(...result.operations);
  }

  return { assets, operations };
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

/** A readable file name from a prompt, so the assets panel is scannable. */
export function slugifyPrompt(prompt: string): string {
  return (
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 6)
      .join('-') || 'generated'
  );
}
