import {
  walk,
  type DesignDocument,
  type ExporterContribution,
  type GeneratedFile,
  type SceneNode,
} from '@opendesign/core';
import {
  buildThemeCss,
  cssPropertiesToString,
  styleToCssProperties,
} from '@opendesign/design-system';
import { motionStylesheet } from '@opendesign/renderer';
import { serializeElement } from '../emit/serialize.js';
import { buildElementTree, toKebabCase, type EmitElement } from '../emit/tree.js';

/**
 * The HTML target is the one with zero dependencies.
 *
 * Instead of Tailwind classes it emits real CSS rules — one class per node,
 * plus media queries for responsive overrides. The output opens in a browser
 * straight from disk, which makes it the right choice for one-off landing pages
 * and for anyone who does not want a build step at all.
 */

interface CssRule {
  selector: string;
  declarations: Record<string, string>;
  media?: number;
}

function nodeClassName(node: SceneNode): string {
  const base = toKebabCase(node.name || node.type);
  // Node ids are already unique; the suffix keeps names readable *and* unique.
  return `${base}-${node.id.replace(/^n_/, '').slice(0, 4)}`;
}

function collectRules(
  document: DesignDocument,
  rootId: string,
): {
  rules: CssRule[];
  classNames: Map<string, string>;
} {
  const rules: CssRule[] = [];
  const classNames = new Map<string, string>();
  const breakpoints = document.tokens.breakpoint as Record<string, number>;

  walk(document, rootId, (node) => {
    if (node.hidden) return false;

    const className = nodeClassName(node);
    classNames.set(node.id, className);

    const declarations = styleToCssProperties(node.style);
    if (Object.keys(declarations).length > 0) {
      rules.push({ selector: `.${className}`, declarations });
    }

    for (const [breakpoint, override] of Object.entries(node.responsive ?? {})) {
      const minWidth = breakpoints[breakpoint];
      if (!minWidth) continue;
      const overrideDeclarations = styleToCssProperties(override);
      if (Object.keys(overrideDeclarations).length === 0) continue;
      rules.push({
        selector: `.${className}`,
        declarations: overrideDeclarations,
        media: minWidth,
      });
    }

    return true;
  });

  return { rules, classNames };
}

function renderStylesheet(rules: CssRule[]): string {
  const base = rules.filter((r) => r.media === undefined);
  const responsive = rules.filter((r) => r.media !== undefined);

  const lines = base.map(
    (rule) => `${rule.selector} {\n${cssPropertiesToString(rule.declarations)}\n}`,
  );

  const byBreakpoint = new Map<number, CssRule[]>();
  for (const rule of responsive) {
    const list = byBreakpoint.get(rule.media!) ?? [];
    list.push(rule);
    byBreakpoint.set(rule.media!, list);
  }

  for (const [minWidth, group] of [...byBreakpoint.entries()].sort((a, b) => a[0] - b[0])) {
    const inner = group
      .map(
        (rule) => `  ${rule.selector} {\n${cssPropertiesToString(rule.declarations, '    ')}\n  }`,
      )
      .join('\n\n');
    lines.push(`@media (min-width: ${minWidth}px) {\n${inner}\n}`);
  }

  return lines.join('\n\n');
}

/** Swaps Tailwind class names for the generated per-node CSS class names. */
function applyClassNames(element: EmitElement, classNames: Map<string, string>): EmitElement {
  return {
    ...element,
    className: classNames.get(element.nodeId) ?? '',
    children: element.children.map((child) => applyClassNames(child, classNames)),
  };
}

export function generateHtml(document: DesignDocument): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const allRules: CssRule[] = [];

  for (const page of document.pages) {
    const { rules, classNames } = collectRules(document, page.rootId);
    allRules.push(...rules);

    const tree = buildElementTree(document, page.rootId, { omitHidden: true });
    if (!tree) continue;

    const markup = serializeElement(applyClassNames(tree, classNames), {
      dialect: 'html',
      depth: 2,
    });

    const fileName = page.path === '/' ? 'index.html' : `${toKebabCase(page.name)}.html`;

    files.push({
      path: fileName,
      contents: `<!doctype html>
<html lang="en" data-theme="${document.activeThemeId}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(page.meta?.title ?? page.name)}</title>${
      page.meta?.description
        ? `\n    <meta name="description" content="${escapeHtml(page.meta.description)}" />`
        : ''
    }
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
${markup}
  </body>
</html>
`,
    });
  }

  const stylesheet = `/* Design tokens */
${buildThemeCss(document.tokens, document.themes, { tailwind: false })}
/* Reset */
*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--color-background);
  color: var(--color-foreground);
  -webkit-font-smoothing: antialiased;
}

/*
 * The other targets get this from Tailwind's Preflight. This one has no
 * dependencies, so it needs its own — and it is not cosmetic: a browser's
 * default \`h1 { margin: 0.67em 0 }\` silently adds ~40px above and below a
 * display heading, which is how an export stops matching the canvas.
 */
h1,
h2,
h3,
h4,
h5,
h6,
p,
figure,
blockquote,
dl,
dd {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

ul,
ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  margin: 0;
  padding: 0;
}

button {
  cursor: pointer;
}

hr {
  border: 0;
  margin: 0;
}

img,
video,
svg,
iframe {
  display: block;
  max-width: 100%;
}

/* Layout */
${renderStylesheet(dedupeRules(allRules))}

/* Motion */
${motionStylesheet()}
`;

  files.push({ path: 'styles.css', contents: stylesheet });
  files.push({
    path: 'README.md',
    contents: `# ${document.name}

Static export from OpenDesign. No build step and no dependencies — open
\`index.html\` in a browser, or drop the folder on any static host.

Design tokens live at the top of \`styles.css\` as CSS custom properties.
Switch themes by changing \`data-theme\` on the \`<html>\` element.
`,
  });

  return files;
}

function dedupeRules(rules: CssRule[]): CssRule[] {
  const seen = new Set<string>();
  const out: CssRule[] = [];
  for (const rule of rules) {
    const key = `${rule.media ?? 0}|${rule.selector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rule);
  }
  return out;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export const htmlExporter: ExporterContribution = {
  id: 'html',
  label: 'HTML + CSS',
  description: 'Dependency-free static pages with real CSS rules and media queries.',
  generate: (document) => generateHtml(document),
};
