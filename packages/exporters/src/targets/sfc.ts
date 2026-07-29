import type { DesignDocument, ExporterContribution, GeneratedFile } from '@opendesign/core';
import { buildThemeCss } from '@opendesign/design-system';
import { motionStylesheet } from '@opendesign/renderer';
import { collectComponentRefs, serializeElement, type Dialect } from '../emit/serialize.js';
import { splitSections, toKebabCase, toPascalCase } from '../emit/tree.js';

/**
 * Single-file-component targets: Vue, Svelte and Astro.
 *
 * All three write HTML-flavoured markup with `class=`, so they share one code
 * path and differ only in the wrapper around it. Adding Solid or Qwik later is
 * a matter of one more entry in `SFC_TARGETS`.
 */

interface SfcTarget {
  id: string;
  label: string;
  description: string;
  extension: string;
  dialect: Dialect;
  /** Wraps serialized markup into a component file. */
  wrap: (markup: string, imports: { name: string; path: string }[]) => string;
  componentDir: string;
  pageDir: string;
  pageFileName: (pageName: string, path: string) => string;
  scaffold: (document: DesignDocument) => GeneratedFile[];
}

const vueTarget: SfcTarget = {
  id: 'vue',
  label: 'Vue 3',
  description: 'Single-file components with `<script setup>` and Tailwind classes.',
  extension: 'vue',
  dialect: 'vue',
  componentDir: 'src/components',
  pageDir: 'src/pages',
  pageFileName: (pageName) => `${toPascalCase(pageName)}.vue`,
  wrap: (markup, imports) => {
    const importLines = imports.map((i) => `import ${i.name} from '${i.path}';`);
    const script =
      importLines.length > 0
        ? `<script setup lang="ts">\n${importLines.join('\n')}\n</script>\n\n`
        : '';
    return `${script}<template>\n${markup}\n</template>\n`;
  },
  scaffold: (document) => [
    {
      path: 'package.json',
      contents: `${JSON.stringify(
        {
          name: toKebabCase(document.name),
          private: true,
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
          dependencies: { vue: '^3.5.0' },
          devDependencies: {
            '@vitejs/plugin-vue': '^6.0.0',
            '@tailwindcss/vite': '^4.0.0',
            tailwindcss: '^4.0.0',
            vite: '^7.0.0',
          },
        },
        null,
        2,
      )}\n`,
    },
  ],
};

const svelteTarget: SfcTarget = {
  id: 'svelte',
  label: 'Svelte 5',
  description: 'Svelte components with Tailwind classes and a token stylesheet.',
  extension: 'svelte',
  dialect: 'svelte',
  componentDir: 'src/lib/components',
  pageDir: 'src/routes',
  pageFileName: (_pageName, path) =>
    path === '/' ? '+page.svelte' : `${toKebabCase(path)}/+page.svelte`,
  wrap: (markup, imports) => {
    const importLines = imports.map((i) => `  import ${i.name} from '${i.path}';`);
    const script =
      importLines.length > 0 ? `<script lang="ts">\n${importLines.join('\n')}\n</script>\n\n` : '';
    return `${script}${markup}\n`;
  },
  scaffold: (document) => [
    {
      path: 'package.json',
      contents: `${JSON.stringify(
        {
          name: toKebabCase(document.name),
          private: true,
          type: 'module',
          scripts: { dev: 'vite dev', build: 'vite build', preview: 'vite preview' },
          devDependencies: {
            '@sveltejs/kit': '^2.0.0',
            '@sveltejs/vite-plugin-svelte': '^6.0.0',
            '@tailwindcss/vite': '^4.0.0',
            svelte: '^5.0.0',
            tailwindcss: '^4.0.0',
            vite: '^7.0.0',
          },
        },
        null,
        2,
      )}\n`,
    },
  ],
};

const astroTarget: SfcTarget = {
  id: 'astro',
  label: 'Astro',
  description: 'Zero-JS static pages with Tailwind classes and design tokens.',
  extension: 'astro',
  dialect: 'astro',
  componentDir: 'src/components',
  pageDir: 'src/pages',
  pageFileName: (_pageName, path) => (path === '/' ? 'index.astro' : `${toKebabCase(path)}.astro`),
  wrap: (markup, imports) => {
    const importLines = imports.map((i) => `import ${i.name} from '${i.path}';`);
    const frontmatter = `---\nimport '../styles/theme.css';${
      importLines.length > 0 ? `\n${importLines.join('\n')}` : ''
    }\n---\n\n`;
    return `${frontmatter}${markup}\n`;
  },
  scaffold: (document) => [
    {
      path: 'package.json',
      contents: `${JSON.stringify(
        {
          name: toKebabCase(document.name),
          private: true,
          type: 'module',
          scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
          dependencies: { astro: '^5.0.0' },
          devDependencies: { '@tailwindcss/vite': '^4.0.0', tailwindcss: '^4.0.0' },
        },
        null,
        2,
      )}\n`,
    },
  ],
};

export const SFC_TARGETS: SfcTarget[] = [vueTarget, svelteTarget, astroTarget];

function generateSfc(document: DesignDocument, target: SfcTarget): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const page of document.pages) {
    const { shell, sections } = splitSections(document, page.rootId, { omitHidden: true });
    if (!shell) continue;

    for (const section of sections) {
      files.push({
        path: `${target.componentDir}/${section.componentName}.${target.extension}`,
        contents: target.wrap(
          serializeElement(section.element, { dialect: target.dialect, depth: 1 }),
          [],
        ),
      });
    }

    const refs = collectComponentRefs(shell);
    const importPath = target.id === 'svelte' ? '$lib/components' : '../components';

    files.push({
      path: `${target.pageDir}/${target.pageFileName(page.name, page.path)}`,
      contents: target.wrap(
        serializeElement(shell, { dialect: target.dialect, depth: 1 }),
        refs.map((name) => ({ name, path: `${importPath}/${name}.${target.extension}` })),
      ),
    });
  }

  const stylesPath = target.id === 'astro' ? 'src/styles/theme.css' : 'src/app.css';

  files.push({
    path: stylesPath,
    contents: `@import 'tailwindcss';

${buildThemeCss(document.tokens, document.themes)}
${motionStylesheet()}
`,
  });

  files.push(...target.scaffold(document));
  files.push({
    path: 'README.md',
    contents: `# ${document.name}

Exported from OpenDesign as ${target.label}.

Tokens live in \`${stylesPath}\` as a Tailwind v4 \`@theme\` block, so every
colour and spacing value in the markup resolves through one file.
`,
  });

  return files;
}

export const sfcExporters: ExporterContribution[] = SFC_TARGETS.map((target) => ({
  id: target.id,
  label: target.label,
  description: target.description,
  generate: (document) => generateSfc(document, target),
}));

export const vueExporter = sfcExporters[0]!;
export const svelteExporter = sfcExporters[1]!;
export const astroExporter = sfcExporters[2]!;
