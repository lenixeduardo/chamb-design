import {
  definePlugin,
  type DesignDocument,
  type ExporterContribution,
  type GeneratedFile,
  type OpenDesignPlugin,
} from '@opendesign/core';
import { buildThemeCss } from '@opendesign/design-system';
import { buildTimeline } from './timeline.js';

export * from './timeline.js';

/**
 * Video export via Remotion.
 *
 * **This module does not import Remotion.** It emits a runnable Remotion project
 * as strings, exactly the way the React and Vue targets do. That matters for one
 * reason: Remotion is not MIT (see NOTICE.md), so nobody should acquire a
 * licence obligation merely by installing OpenDesign. You get the code; you
 * decide whether to `npm install` it.
 *
 * Rendering an actual MP4 lives in `@opendesign/plugin-remotion/render`, which
 * does import Remotion and is opt-in.
 */

export interface RemotionExportOptions {
  fps?: number;
  width?: number;
  height?: number;
  /** Seconds held after the last animation resolves. */
  tailSeconds?: number;
}

export function generateRemotionProject(
  document: DesignDocument,
  options: RemotionExportOptions = {},
): GeneratedFile[] {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;

  const files: GeneratedFile[] = [];
  const compositions: { id: string; pageId: string; durationInFrames: number }[] = [];

  for (const page of document.pages) {
    const timeline = buildTimeline(document, page.rootId, {
      fps,
      ...(options.tailSeconds !== undefined
        ? { tailFrames: Math.round(options.tailSeconds * fps) }
        : {}),
    });

    compositions.push({
      id: toPascalCase(page.name),
      pageId: page.id,
      durationInFrames: timeline.durationInFrames,
    });
  }

  files.push({
    path: 'src/document.json',
    contents: `${JSON.stringify(document, null, 2)}\n`,
  });

  files.push({
    path: 'src/theme.css',
    contents: `${buildThemeCss(document.tokens, document.themes, { tailwind: false })}
* ,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--color-background);
  color: var(--color-foreground);
}

h1, h2, h3, h4, h5, h6, p {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

a {
  color: inherit;
  text-decoration: none;
}
`,
  });

  files.push({
    path: 'src/Scene.tsx',
    contents: `import { useCurrentFrame } from 'remotion';
import { PageRenderer } from '@opendesign/renderer';
import { buildTimeline, frameStates } from '@opendesign/plugin-remotion';
import type { DesignDocument } from '@opendesign/core';
import './theme.css';

/**
 * One page, animated by frame.
 *
 * The renderer is used in \`inline\` style mode because Remotion's bundle has no
 * Tailwind pass — the class names in a document are generated at runtime, so
 * there would be no CSS for them. Inline mode compiles the same StyleMap into
 * real declarations.
 *
 * Motion is applied by patching each animated node's style for the current
 * frame, rather than by wrapping nodes in Remotion components. Wrapping would
 * insert elements the layout does not expect and break auto-layout gaps.
 */
export function Scene({
  document,
  pageId,
  fps,
}: {
  document: DesignDocument;
  pageId: string;
  fps: number;
}) {
  const frame = useCurrentFrame();
  const page = document.pages.find((candidate) => candidate.id === pageId) ?? document.pages[0];
  const { entries } = buildTimeline(document, page.rootId, { fps });
  const states = frameStates(entries, frame);

  const animated: DesignDocument = {
    ...document,
    nodes: Object.fromEntries(
      Object.entries(document.nodes).map(([id, node]) => {
        const state = states[id];
        if (!state) return [id, node];
        return [
          id,
          {
            ...node,
            // \`motion\` is stripped so the CSS engine does not also animate it.
            motion: undefined,
            style: {
              ...node.style,
              opacity: state.opacity,
              transform: state.transform,
            },
          },
        ];
      }),
    ),
  };

  return (
    <PageRenderer
      document={animated}
      pageId={page.id}
      styleMode="inline"
      breakpoint="xl"
      editorAttributes={false}
    />
  );
}
`,
  });

  files.push({
    path: 'src/Root.tsx',
    contents: `import { Composition } from 'remotion';
import { Scene } from './Scene';
import document from './document.json';
import type { DesignDocument } from '@opendesign/core';

const doc = document as unknown as DesignDocument;

export function RemotionRoot() {
  return (
    <>
${compositions
  .map(
    (composition) => `      <Composition
        id="${composition.id}"
        component={Scene}
        durationInFrames={${composition.durationInFrames}}
        fps={${fps}}
        width={${width}}
        height={${height}}
        defaultProps={{ document: doc, pageId: '${composition.pageId}', fps: ${fps} }}
      />`,
  )
  .join('\n')}
    </>
  );
}
`,
  });

  files.push({
    path: 'src/index.ts',
    contents: `import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
`,
  });

  files.push({
    path: 'remotion.config.ts',
    contents: `import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
`,
  });

  files.push({
    path: 'package.json',
    contents: `${JSON.stringify(
      {
        name: `${toKebabCase(document.name)}-video`,
        private: true,
        scripts: {
          studio: 'remotion studio',
          render: `remotion render ${compositions[0]?.id ?? 'Home'} out/video.mp4`,
        },
        dependencies: {
          '@opendesign/core': '^0.1.0',
          '@opendesign/plugin-remotion': '^0.1.0',
          '@opendesign/renderer': '^0.1.0',
          react: '^19.0.0',
          'react-dom': '^19.0.0',
          remotion: '^4.0.0',
        },
        devDependencies: {
          '@remotion/cli': '^4.0.0',
          typescript: '^5.9.0',
        },
      },
      null,
      2,
    )}\n`,
  });

  files.push({
    path: 'README.md',
    contents: `# ${document.name} — video

Generated by OpenDesign. Animations come from each node's \`motion\` spec, so the
video matches what the canvas previews.

\`\`\`bash
pnpm install
pnpm studio    # interactive timeline
pnpm render    # writes out/video.mp4
\`\`\`

## Licensing

Remotion is **not** MIT. Individuals, non-profits and for-profit companies with
up to 3 employees may use it for free; larger companies need a paid company
licence. See <https://remotion.dev/license>.

OpenDesign does not install Remotion for you — this project's \`package.json\`
declares it, and running \`pnpm install\` here is you accepting those terms.

## Compositions

${compositions
  .map(
    (composition) =>
      `- \`${composition.id}\` — ${composition.durationInFrames} frames at ${fps}fps (${(
        composition.durationInFrames / fps
      ).toFixed(1)}s)`,
  )
  .join('\n')}
`,
  });

  return files;
}

export const remotionExporter: ExporterContribution = {
  id: 'remotion',
  label: 'Video (Remotion)',
  description:
    'A runnable Remotion project driven by each node’s motion spec. Remotion is separately licensed.',
  generate: (document, options) =>
    generateRemotionProject(document, (options ?? {}) as RemotionExportOptions),
};

export const remotionPlugin: OpenDesignPlugin = definePlugin({
  id: 'community.remotion',
  name: 'Remotion video export',
  version: '0.1.0',
  description: 'Exports a page as an animated video project. Remotion is separately licensed.',
  author: 'OpenDesign community',
  activate(context) {
    context.registerExporter(remotionExporter);
    context.log('video export registered — Remotion itself is an optional peer dependency');
  },
});

export default remotionPlugin;

function toPascalCase(input: string): string {
  const pascal = input
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  return /^[0-9]/.test(pascal) ? `Page${pascal}` : pascal || 'Page';
}

function toKebabCase(input: string): string {
  return (
    input
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'project'
  );
}
