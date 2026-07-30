/**
 * Actually rendering an MP4. Node-only, and the only place Remotion is imported.
 *
 * Separate entry point on purpose: `@remotion/renderer` drives a headless
 * browser and pulls in Node builtins, so a web bundle must never trace it. It is
 * also the module that carries the licence obligation — importing this file is
 * the point at which you need Remotion installed.
 */

export interface RenderVideoOptions {
  /** Directory containing a project emitted by the `remotion` export target. */
  projectDir: string;
  /** Composition id, e.g. `Home`. Defaults to the first one found. */
  compositionId?: string;
  outputPath: string;
  codec?: 'h264' | 'h265' | 'vp8' | 'vp9' | 'prores' | 'gif';
  /** 1 = full size, 0.5 = half. Useful for quick previews. */
  scale?: number;
  concurrency?: number;
  onProgress?: (progress: { renderedFrames: number; totalFrames: number }) => void;
}

export interface RenderVideoResult {
  outputPath: string;
  compositionId: string;
  durationInFrames: number;
  fps: number;
}

export class RemotionNotInstalledError extends Error {
  constructor(missing: string) {
    super(
      `[opendesign:remotion] ${missing} is not installed.\n\n` +
        'Video rendering needs Remotion, which is separately licensed:\n' +
        '  pnpm add remotion @remotion/renderer @remotion/bundler\n\n' +
        'Free for individuals, non-profits and companies with up to 3 employees.\n' +
        'Larger companies need a paid licence — https://remotion.dev/license\n\n' +
        'The export target still works without this: it emits a runnable project.',
    );
    this.name = 'RemotionNotInstalledError';
  }
}

/**
 * Bundles and renders a composition.
 *
 * Imports are dynamic so that merely importing this module does not fail when
 * Remotion is absent — the error surfaces at the moment of use, with something
 * actionable to read.
 */
export async function renderVideo(options: RenderVideoOptions): Promise<RenderVideoResult> {
  const bundler = await importOptional<typeof import('@remotion/bundler')>('@remotion/bundler');
  const renderer = await importOptional<typeof import('@remotion/renderer')>('@remotion/renderer');

  const { join } = await import('node:path');

  const entryPoint = join(options.projectDir, 'src', 'index.ts');
  const serveUrl = await bundler.bundle({ entryPoint });

  const compositions = await renderer.getCompositions(serveUrl);
  if (compositions.length === 0) {
    throw new Error(
      `[opendesign:remotion] no compositions found in ${options.projectDir}. ` +
        'Was the project emitted by the "remotion" export target?',
    );
  }

  const composition = options.compositionId
    ? compositions.find((candidate) => candidate.id === options.compositionId)
    : compositions[0];

  if (!composition) {
    throw new Error(
      `[opendesign:remotion] composition "${options.compositionId}" not found. ` +
        `Available: ${compositions.map((c) => c.id).join(', ')}`,
    );
  }

  await renderer.renderMedia({
    composition,
    serveUrl,
    codec: options.codec ?? 'h264',
    outputLocation: options.outputPath,
    ...(options.scale !== undefined ? { scale: options.scale } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    ...(options.onProgress
      ? {
          onProgress: ({ renderedFrames }: { renderedFrames: number }) =>
            options.onProgress?.({
              renderedFrames,
              totalFrames: composition.durationInFrames,
            }),
        }
      : {}),
  });

  return {
    outputPath: options.outputPath,
    compositionId: composition.id,
    durationInFrames: composition.durationInFrames,
    fps: composition.fps,
  };
}

/** Renders a single frame as a still — cheap way to preview or make an OG image. */
export async function renderStill(options: {
  projectDir: string;
  compositionId?: string;
  outputPath: string;
  frame?: number;
}): Promise<{ outputPath: string }> {
  const bundler = await importOptional<typeof import('@remotion/bundler')>('@remotion/bundler');
  const renderer = await importOptional<typeof import('@remotion/renderer')>('@remotion/renderer');

  const { join } = await import('node:path');

  const serveUrl = await bundler.bundle({
    entryPoint: join(options.projectDir, 'src', 'index.ts'),
  });
  const compositions = await renderer.getCompositions(serveUrl);

  const composition = options.compositionId
    ? compositions.find((candidate) => candidate.id === options.compositionId)
    : compositions[0];

  if (!composition) {
    throw new Error(`[opendesign:remotion] composition not found in ${options.projectDir}`);
  }

  await renderer.renderStill({
    composition,
    serveUrl,
    output: options.outputPath,
    frame: options.frame ?? composition.durationInFrames - 1,
  });

  return { outputPath: options.outputPath };
}

async function importOptional<T>(specifier: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ specifier)) as T;
  } catch {
    throw new RemotionNotInstalledError(specifier);
  }
}
