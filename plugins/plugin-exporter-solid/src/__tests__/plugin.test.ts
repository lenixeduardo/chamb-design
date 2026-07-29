import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  seededRng,
  setIdRng,
  type DesignDocument,
} from '@opendesign/core';
import { componentsPlugin, heroCentered, navbar } from '@opendesign/components';
import { exportProject, exportersPlugin } from '@opendesign/exporters';
import { solidExporterPlugin } from '../index.js';

function buildDocument(): DesignDocument {
  setIdRng(seededRng(41));
  let doc = createDocument({ name: 'Solid Demo' });
  const rootId = doc.pages[0]!.rootId;

  let counter = 0;
  const createId = () => `s_${(counter += 1)}`;

  for (const [index, block] of [navbar, heroCentered].entries()) {
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

describe('solid exporter plugin', () => {
  it('adds a seventh target next to the built-in six', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, exportersPlugin, solidExporterPlugin]);

    expect(registry.getExporters()).toHaveLength(7);
    expect(registry.getExporter('solid')?.label).toBe('SolidJS');
  });

  it('runs through the same exportProject entry point as built-in targets', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, exportersPlugin, solidExporterPlugin]);

    const result = await exportProject(registry, buildDocument(), 'solid');

    expect(result.targetId).toBe('solid');
    expect(result.files.some((file) => file.path === 'src/routes/index.tsx')).toBe(true);
    expect(result.files.some((file) => file.path === 'src/components/Navbar.tsx')).toBe(true);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('emits Solid-flavoured JSX with class, not className', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, exportersPlugin, solidExporterPlugin]);

    const { files } = await exportProject(registry, buildDocument(), 'solid');
    const component = files.find((file) => file.path === 'src/components/Navbar.tsx')!;

    expect(component.contents).toContain('class=');
    expect(component.contents).not.toContain('className=');
  });

  it('carries the design tokens through', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, exportersPlugin, solidExporterPlugin]);

    const { files } = await exportProject(registry, buildDocument(), 'solid');
    const styles = files.find((file) => file.path === 'src/app.css')!;
    expect(styles.contents).toContain('--color-accent');
  });
});
