import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  resolveStyle,
  seededRng,
  setIdRng,
  validateDocumentIntegrity,
} from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import {
  CHAMB_BLOCKS,
  buildChambTemplate,
  chambBrandPlugin,
  chambThemes,
  chambTokens,
} from '../index.js';

function makeCreateId() {
  let counter = 0;
  return () => `cb_${(counter += 1)}`;
}

function resolveTokenPath(tokens: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = tokens;
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function collectRefs(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('{') && value.endsWith('}')) found.push(value.slice(1, -1));
    return found;
  }
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) collectRefs(item, found);
  }
  return found;
}

describe('chamb brand plugin', () => {
  it('registers blocks and a template through the public API', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, chambBrandPlugin]);

    expect(registry.getComponents().map((c) => c.id)).toEqual(
      expect.arrayContaining(['chamb:hero', 'chamb:feature-cards', 'chamb:showcase', 'chamb:cta']),
    );
    expect(registry.getTemplates().map((t) => t.id)).toEqual(['chamb:starter']);
  });

  it('has no small radius step, so pills and surfaces cannot be mismatched', () => {
    const radius = chambTokens().radius as Record<string, string>;
    // The scale intentionally starts at 8px — see the note in tokens.ts.
    expect(Number.parseInt(radius.sm!, 10)).toBeGreaterThanOrEqual(8);
    expect(radius.full).toBe('9999px');
  });

  it('ships a light and a dark theme that both define the inverted surface', () => {
    const themes = chambThemes();
    expect(themes.map((t) => t.appearance)).toEqual(['light', 'dark']);

    for (const theme of themes) {
      const colors = theme.tokens.color as Record<string, string>;
      expect(colors.contrast).toBeTruthy();
      expect(colors['contrast-foreground']).toBeTruthy();
      // Inverting must actually invert: contrast differs from background.
      expect(colors.contrast).not.toBe(colors.background);
    }
  });
});

describe.each(CHAMB_BLOCKS.map((b) => [b.id, b] as const))('block %s', (_id, block) => {
  const built = block.create({ createId: makeCreateId(), tokens: chambTokens() });

  it('produces a valid subtree that inserts into a document', () => {
    setIdRng(seededRng(2026));
    const doc = createDocument();
    const fresh = block.create({ createId: makeCreateId(), tokens: doc.tokens });

    const result = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: fresh.nodes,
      rootId: fresh.rootId,
      parentId: doc.pages[0]!.rootId,
      index: 0,
    });

    expect(validateDocumentIntegrity(result.document).errors).toEqual([]);
    expect(result.document.nodes[fresh.rootId]!.parent).toBe(doc.pages[0]!.rootId);
  });

  it('only references tokens the chamb set defines', () => {
    const tokens = chambTokens() as unknown as Record<string, unknown>;
    const missing: string[] = [];

    for (const node of built.nodes) {
      const styles = [node.style, ...Object.values(node.responsive ?? {})];
      for (const style of styles) {
        for (const ref of collectRefs(style)) {
          if (resolveTokenPath(tokens, ref) === undefined) {
            missing.push(`${node.name} -> {${ref}}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('scales its display type up at md and above', () => {
    const responsive = built.nodes.filter((node) => node.responsive);
    // Every brand block has at least one node that changes with the viewport;
    // a block that renders identically at 390px and 1440px is a bug here.
    expect(responsive.length).toBeGreaterThan(0);

    for (const node of responsive) {
      const base = resolveStyle(node, 'base');
      const wide = resolveStyle(node, 'xl');
      expect(JSON.stringify(base)).not.toBe(JSON.stringify(wide));
    }
  });
});

describe('chamb starter template', () => {
  const document = buildChambTemplate();

  it('is a structurally valid document', () => {
    const integrity = validateDocumentIntegrity(document);
    expect(integrity.errors).toEqual([]);
  });

  it('carries the brand tokens and the light theme as default', () => {
    expect(document.activeThemeId).toBe('chamb-light');
    expect((document.tokens.color as Record<string, string>).accent).toBe('#E83D3D');
    expect((document.tokens.color as Record<string, string>).background).toBe('#FFFCF5');
    expect(document.themes.map((t) => t.id)).toEqual(['chamb-light', 'chamb-dark']);
  });

  it('includes neutral library blocks so theme inheritance is exercised', () => {
    const names = Object.values(document.nodes).map((node) => node.name);
    expect(names).toEqual(expect.arrayContaining(['Navbar', 'Pricing', 'FAQ', 'Footer']));
  });

  it('sets page metadata rather than leaving it blank', () => {
    expect(document.pages[0]!.meta?.title).toContain('chamb-design');
    expect(document.pages[0]!.meta?.description).toBeTruthy();
  });

  it('lays out sections at the page root, not nested', () => {
    const root = document.nodes[document.pages[0]!.rootId]!;
    expect(root.children.length).toBe(8);
    for (const childId of root.children) {
      expect(document.nodes[childId]!.parent).toBe(root.id);
    }
  });

  it('is deterministic enough to diff between runs', () => {
    const a = buildChambTemplate();
    const b = buildChambTemplate();
    // Ids differ by design, but the shape must not.
    expect(Object.keys(a.nodes).length).toBe(Object.keys(b.nodes).length);
    expect(a.pages[0]!.meta).toEqual(b.pages[0]!.meta);
  });
});
