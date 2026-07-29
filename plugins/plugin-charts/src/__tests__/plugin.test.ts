import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  defaultTokens,
  seededRng,
  setIdRng,
  validateDocumentIntegrity,
} from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import { CHART_COMPONENTS, chartsPlugin } from '../index.js';

/**
 * These tests are the real contract check for the plugin API.
 *
 * A third-party plugin has to be able to do everything a first-party one does,
 * using nothing but the published exports. If any of these needed a private
 * import to pass, the plugin system would be decorative.
 */

function makeCreateId() {
  let counter = 0;
  return () => `c_${(counter += 1)}`;
}

describe('charts plugin', () => {
  it('registers alongside the built-in library without collisions', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, chartsPlugin]);

    const chartBlocks = registry.getComponents('Charts');
    expect(chartBlocks.map((c) => c.id)).toEqual(
      expect.arrayContaining(['charts:bar', 'charts:donut', 'charts:sparkline']),
    );
    // The built-in chart card shares the category; both coexist.
    expect(chartBlocks.length).toBeGreaterThan(CHART_COMPONENTS.length);
  });

  it('refuses a duplicate contribution id and names the culprit', async () => {
    const registry = new PluginRegistry();
    await registry.register(chartsPlugin);

    await expect(
      registry.register({
        ...chartsPlugin,
        id: 'community.charts-copy',
      }),
    ).rejects.toThrow(/already contributed by "community.charts"/);
  });

  it('unregisters cleanly, removing its contributions', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, chartsPlugin]);
    const before = registry.getComponents().length;

    await registry.unregister('community.charts');

    expect(registry.getComponents()).toHaveLength(before - CHART_COMPONENTS.length);
    expect(registry.getComponent('charts:bar')).toBeUndefined();
    // The built-in library is untouched.
    expect(registry.getComponent('lib:pricing-table')).toBeDefined();
  });

  it('enforces declared dependencies', async () => {
    const registry = new PluginRegistry();
    await expect(
      registry.register({
        ...chartsPlugin,
        id: 'community.charts-dependent',
        dependencies: ['does.not.exist'],
      }),
    ).rejects.toThrow(/requires "does.not.exist"/);
  });
});

describe.each(CHART_COMPONENTS.map((c) => [c.id, c] as const))('chart %s', (_id, component) => {
  it('builds a valid subtree that inserts into a document', () => {
    setIdRng(seededRng(31));
    const doc = createDocument();
    const built = component.create({ createId: makeCreateId(), tokens: doc.tokens });

    const result = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: built.nodes,
      rootId: built.rootId,
      parentId: doc.pages[0]!.rootId,
      index: 0,
    });

    expect(validateDocumentIntegrity(result.document).errors).toEqual([]);
  });

  it('accepts custom series data', () => {
    const built = component.create({
      createId: makeCreateId(),
      tokens: defaultTokens(),
      props: { series: '10,20,30', labels: 'A,B,C' },
    });
    expect(built.nodes.length).toBeGreaterThan(1);
  });

  it('survives malformed series input', () => {
    const built = component.create({
      createId: makeCreateId(),
      tokens: defaultTokens(),
      props: { series: 'not,a,number' },
    });
    // Falls back to the defaults rather than emitting NaN heights.
    const heights = built.nodes
      .map((node) => node.style.height)
      .filter((height): height is string => typeof height === 'string');
    expect(heights.some((height) => height.includes('NaN'))).toBe(false);
  });
});
