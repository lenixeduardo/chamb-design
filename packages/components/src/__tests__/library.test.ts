import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  defaultTokens,
  seededRng,
  setIdRng,
  validateDocumentIntegrity,
  type SceneNode,
} from '@opendesign/core';
import { BUILTIN_COMPONENTS, componentsPlugin } from '../index.js';

function makeCreateId() {
  let counter = 0;
  return () => `n_${(counter += 1)}`;
}

describe('component library', () => {
  it('registers every block through the public plugin API', async () => {
    const registry = new PluginRegistry();
    await registry.register(componentsPlugin);

    expect(registry.getComponents()).toHaveLength(BUILTIN_COMPONENTS.length);
    expect(registry.getCategories()).toEqual(
      expect.arrayContaining([
        'Buttons',
        'Cards',
        'Hero',
        'FAQ',
        'Pricing',
        'Navbar',
        'Footer',
        'Forms',
        'Dashboard',
        'Charts',
        'CRM',
        'Landing Pages',
      ]),
    );
  });

  it('exposes unique ids', () => {
    const ids = BUILTIN_COMPONENTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('finds blocks by keyword', async () => {
    const registry = new PluginRegistry();
    await registry.register(componentsPlugin);

    expect(registry.searchComponents('kanban').map((c) => c.id)).toContain('lib:crm-pipeline');
    expect(registry.searchComponents('login').map((c) => c.id)).toContain('lib:auth-form');
  });
});

describe.each(BUILTIN_COMPONENTS.map((c) => [c.id, c] as const))('block %s', (_id, component) => {
  const built = component.create({ createId: makeCreateId(), tokens: defaultTokens() });

  it('returns a well-formed subtree', () => {
    expect(built.nodes.length).toBeGreaterThan(0);
    expect(built.nodes.some((n) => n.id === built.rootId)).toBe(true);
  });

  it('lists parents before their children', () => {
    const seen = new Set<string>();
    for (const node of built.nodes) {
      if (node.parent !== null) expect(seen.has(node.parent)).toBe(true);
      seen.add(node.id);
    }
  });

  it('wires parent and children references both ways', () => {
    const byId = new Map(built.nodes.map((n) => [n.id, n]));
    for (const node of built.nodes) {
      for (const childId of node.children) {
        expect(byId.get(childId)?.parent).toBe(node.id);
      }
    }
  });

  it('inserts into a document and leaves it structurally valid', () => {
    setIdRng(seededRng(7));
    const doc = createDocument();
    const rootId = doc.pages[0]!.rootId;

    const fresh = component.create({ createId: makeCreateId(), tokens: doc.tokens });
    const result = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: fresh.nodes as SceneNode[],
      rootId: fresh.rootId,
      parentId: rootId,
      index: 0,
    });

    const integrity = validateDocumentIntegrity(result.document);
    expect(integrity.errors).toEqual([]);
    expect(integrity.ok).toBe(true);
  });

  it('declares prop defaults for every editable prop', () => {
    for (const prop of component.props) {
      expect(prop.name).toBeTruthy();
      expect(prop.type).toBeTruthy();
    }
  });
});
