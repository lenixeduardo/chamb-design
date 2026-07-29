import {
  definePlugin,
  type DesignDocument,
  type ExporterContribution,
  type GeneratedFile,
  type OpenDesignPlugin,
} from '@opendesign/core';
import { buildThemeCss } from '@opendesign/design-system';
import {
  collectComponentRefs,
  serializeElement,
  splitSections,
  toKebabCase,
} from '@opendesign/exporters';

/**
 * Example: an exporter plugin.
 *
 * The interesting part is how little there is. `@opendesign/exporters` exposes
 * the shared element tree and its serializers, so a new target only has to
 * decide how to *spell* the markup and what project scaffold to emit around it.
 *
 * SolidJS is a good demonstration precisely because it is JSX-but-not-React:
 * it wants `class` rather than `className`, which is exactly the kind of
 * difference the serializer layer exists to absorb.
 */
export function generateSolid(document: DesignDocument): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const page of document.pages) {
    const { shell, sections } = splitSections(document, page.rootId, { omitHidden: true });
    if (!shell) continue;

    for (const section of sections) {
      files.push({
        path: `src/components/${section.componentName}.tsx`,
        contents: `export function ${section.componentName}() {
  return (
${serializeElement(section.element, { dialect: 'vue', depth: 2 })}
  );
}
`,
      });
    }

    const refs = collectComponentRefs(shell);
    const imports = refs.map((ref) => `import { ${ref} } from '../components/${ref}';`).join('\n');

    files.push({
      path: `src/routes/${page.path === '/' ? 'index' : toKebabCase(page.path)}.tsx`,
      contents: `${imports ? `${imports}\n\n` : ''}export default function Page() {
  return (
${serializeElement(shell, { dialect: 'vue', depth: 2 })}
  );
}
`,
    });
  }

  files.push({
    path: 'src/app.css',
    contents: `@import 'tailwindcss';\n\n${buildThemeCss(document.tokens, document.themes)}`,
  });

  files.push({
    path: 'package.json',
    contents: `${JSON.stringify(
      {
        name: toKebabCase(document.name),
        private: true,
        type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { 'solid-js': '^1.9.0' },
        devDependencies: {
          '@tailwindcss/vite': '^4.0.0',
          tailwindcss: '^4.0.0',
          vite: '^7.0.0',
          'vite-plugin-solid': '^2.11.0',
        },
      },
      null,
      2,
    )}\n`,
  });

  return files;
}

export const solidExporter: ExporterContribution = {
  id: 'solid',
  label: 'SolidJS',
  description: 'Solid components with Tailwind classes and a token stylesheet.',
  generate: (document) => generateSolid(document),
};

export const solidExporterPlugin: OpenDesignPlugin = definePlugin({
  id: 'community.exporter-solid',
  name: 'SolidJS exporter',
  version: '0.1.0',
  description: 'Adds SolidJS as an export target.',
  author: 'OpenDesign community',
  activate(context) {
    context.registerExporter(solidExporter);
  },
});

export default solidExporterPlugin;
