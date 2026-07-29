import type { DesignDocument, ExporterContribution, GeneratedFile } from '@opendesign/core';
import { buildThemeCss } from '@opendesign/design-system';
import { motionStylesheet } from '@opendesign/renderer';
import { collectComponentRefs, serializeElement } from '../emit/serialize.js';
import { pageRouteSegment, splitSections, toKebabCase, toPascalCase } from '../emit/tree.js';

/**
 * React and Next.js share ~90% of their output: the same components, the same
 * Tailwind classes, the same theme stylesheet. Only the routing shell and the
 * project scaffold differ.
 */

export interface ReactExportOptions {
  /** `react` emits a Vite app; `next` emits the App Router. */
  flavor?: 'react' | 'next';
  typescript?: boolean;
  /** Cut each top-level frame into its own component file. */
  splitSections?: boolean;
}

function componentFile(name: string, body: string, imports: string[]): string {
  const importLines = imports.map((ref) => `import { ${ref} } from './${ref}';`);
  const header = importLines.length > 0 ? `${importLines.join('\n')}\n\n` : '';

  return `${header}export function ${name}() {
  return (
${body}
  );
}
`;
}

export function generateReact(
  document: DesignDocument,
  options: ReactExportOptions = {},
): GeneratedFile[] {
  const { flavor = 'react', typescript = true, splitSections: split = true } = options;
  const ext = typescript ? 'tsx' : 'jsx';
  const files: GeneratedFile[] = [];

  const componentDir = flavor === 'next' ? 'components' : 'src/components';
  const pageDir = flavor === 'next' ? 'app' : 'src/pages';

  for (const page of document.pages) {
    const pageName = toPascalCase(page.name);

    if (split) {
      const { shell, sections } = splitSections(document, page.rootId, { omitHidden: true });
      if (!shell) continue;

      for (const sectionRef of sections) {
        files.push({
          path: `${componentDir}/${sectionRef.componentName}.${ext}`,
          contents: componentFile(
            sectionRef.componentName,
            serializeElement(sectionRef.element, { dialect: 'jsx', depth: 2 }),
            [],
          ),
        });
      }

      const refs = collectComponentRefs(shell);
      const body = serializeElement(shell, { dialect: 'jsx', depth: 2 });

      const importPrefix = flavor === 'next' ? '@/components/' : '../components/';
      const importLines = refs.map((ref) => `import { ${ref} } from '${importPrefix}${ref}';`);
      const header = importLines.length > 0 ? `${importLines.join('\n')}\n\n` : '';

      const routePath =
        flavor === 'next'
          ? `${pageDir}/${pageRouteSegment(page.path)}${pageRouteSegment(page.path) ? '/' : ''}page.${ext}`
          : `${pageDir}/${toKebabCase(page.name)}.${ext}`;

      const exportKeyword = flavor === 'next' ? 'export default function Page' : `export function ${pageName}`;

      files.push({
        path: routePath,
        contents: `${header}${exportKeyword}() {
  return (
${body}
  );
}
`,
      });
      continue;
    }

    const element = splitSections(document, page.rootId, { omitHidden: true }).shell;
    if (!element) continue;

    files.push({
      path: `${pageDir}/${toKebabCase(page.name)}.${ext}`,
      contents: componentFile(pageName, serializeElement(element, { dialect: 'jsx', depth: 2 }), []),
    });
  }

  files.push(...sharedAssets(document, flavor));
  return files;
}

function sharedAssets(document: DesignDocument, flavor: 'react' | 'next'): GeneratedFile[] {
  const stylesPath = flavor === 'next' ? 'app/globals.css' : 'src/styles.css';

  const styles = `@import 'tailwindcss';

${buildThemeCss(document.tokens, document.themes)}
/* Motion primitives — no runtime dependency, honours prefers-reduced-motion. */
${motionStylesheet()}
`;

  const pkg = {
    name: toKebabCase(document.name),
    private: true,
    type: 'module',
    scripts:
      flavor === 'next'
        ? { dev: 'next dev', build: 'next build', start: 'next start' }
        : { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies:
      flavor === 'next'
        ? { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' }
        : { react: '^19.0.0', 'react-dom': '^19.0.0' },
    devDependencies: {
      '@tailwindcss/postcss': '^4.0.0',
      tailwindcss: '^4.0.0',
      ...(flavor === 'react' ? { vite: '^7.0.0', '@vitejs/plugin-react': '^5.0.0' } : {}),
    },
  };

  const readme = `# ${document.name}

Exported from [OpenDesign](https://github.com/opendesign/opendesign).

## Running it

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## What is in here

- \`${stylesPath}\` — the design tokens as a Tailwind v4 \`@theme\` block. Every
  colour, spacing step and radius in the markup resolves through it, so
  retheming the whole project is a single-file change.
- Components use plain Tailwind utility classes. There is no OpenDesign runtime
  and nothing to install beyond React and Tailwind.
`;

  const files: GeneratedFile[] = [
    { path: stylesPath, contents: styles },
    { path: 'package.json', contents: `${JSON.stringify(pkg, null, 2)}\n` },
    { path: 'README.md', contents: readme },
    {
      path: 'postcss.config.mjs',
      contents: `export default {\n  plugins: { '@tailwindcss/postcss': {} },\n};\n`,
    },
  ];

  if (flavor === 'next') {
    files.push({
      path: 'app/layout.tsx',
      contents: `import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: ${JSON.stringify(document.name)},
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme=${JSON.stringify(document.activeThemeId)}>
      <body>{children}</body>
    </html>
  );
}
`,
    });
  }

  return files;
}

export const reactExporter: ExporterContribution = {
  id: 'react',
  label: 'React (Vite)',
  description: 'Function components with Tailwind classes and a token theme file.',
  generate: (document, options) => generateReact(document, { ...options, flavor: 'react' }),
};

export const nextExporter: ExporterContribution = {
  id: 'next',
  label: 'Next.js (App Router)',
  description: 'App Router pages, shared components and a global token stylesheet.',
  generate: (document, options) => generateReact(document, { ...options, flavor: 'next' }),
};
