import { beforeEach, describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  createDocument,
  getNode,
  seededRng,
  setIdRng,
  validateDocumentIntegrity,
} from '@opendesign/core';
import { componentsPlugin } from '@opendesign/components';
import { Editor, cloneSubtree } from '../editor.js';
import { BINDINGS, eventToCombo, formatCombo } from '../keymap.js';

let registry: PluginRegistry;

beforeEach(async () => {
  setIdRng(seededRng(21));
  registry = new PluginRegistry();
  await registry.register(componentsPlugin);
});

function makeEditor() {
  const document = createDocument({ name: 'Editor test' });
  const editor = new Editor(document, { registry });
  return { editor, rootId: document.pages[0]!.rootId };
}

describe('selection', () => {
  it('drops nested ids when an ancestor is also selected', () => {
    const { editor, rootId } = makeEditor();
    const frameId = editor.insertPrimitive('frame')!;
    const childId = editor.insertPrimitive('text')!;

    editor.select([rootId, frameId, childId]);
    expect(editor.getState().selection).toEqual([rootId]);

    // Siblings, with no ancestor relationship, all survive.
    editor.select([frameId]);
    const siblingId = editor.insertPrimitive('text')!;
    expect(editor.getDocument().nodes[siblingId]!.parent).toBe(frameId);
  });

  it('ignores ids that are not in the document', () => {
    const { editor } = makeEditor();
    editor.select(['ghost']);
    expect(editor.getState().selection).toEqual([]);
  });

  it('toggles ids in and out', () => {
    const { editor } = makeEditor();
    const a = editor.insertPrimitive('frame')!;
    editor.clearSelection();

    editor.toggleSelection(a);
    expect(editor.getState().selection).toEqual([a]);
    editor.toggleSelection(a);
    expect(editor.getState().selection).toEqual([]);
  });

  it('walks up to the parent', () => {
    const { editor } = makeEditor();
    const frameId = editor.insertPrimitive('frame')!;
    const childId = editor.insertPrimitive('text')!;

    editor.select(childId);
    editor.selectParent();
    expect(editor.getState().selection).toEqual([frameId]);
  });
});

describe('insertion targeting', () => {
  it('drops new nodes inside a selected container', () => {
    const { editor } = makeEditor();
    const frameId = editor.insertPrimitive('frame')!;
    const textId = editor.insertPrimitive('text')!;

    expect(getNode(editor.getDocument(), textId)!.parent).toBe(frameId);
  });

  it('drops new nodes next to a selected leaf', () => {
    const { editor, rootId } = makeEditor();
    const first = editor.insertPrimitive('text')!;
    const second = editor.insertPrimitive('text')!;

    const root = getNode(editor.getDocument(), rootId)!;
    expect(root.children).toEqual([first, second]);
  });

  it('inserts a library block and selects its root', () => {
    const { editor } = makeEditor();
    const id = editor.insertBlock('lib:pricing-table')!;

    expect(editor.getState().selection).toEqual([id]);
    expect(Object.keys(editor.getDocument().nodes).length).toBeGreaterThan(20);
    expect(validateDocumentIntegrity(editor.getDocument()).ok).toBe(true);
  });

  it('rejects an unknown block id', () => {
    const { editor } = makeEditor();
    expect(() => editor.insertBlock('lib:nope')).toThrow(/unknown component/);
  });
});

describe('editing commands', () => {
  it('deletes the selected subtree', () => {
    const { editor } = makeEditor();
    const id = editor.insertPrimitive('frame')!;
    const childId = editor.insertPrimitive('text')!;

    editor.select(id);
    editor.deleteSelection();

    expect(getNode(editor.getDocument(), id)).toBeUndefined();
    expect(getNode(editor.getDocument(), childId)).toBeUndefined();
    expect(editor.getState().selection).toEqual([]);
  });

  it('refuses to delete a page root', () => {
    const { editor, rootId } = makeEditor();

    editor.select(rootId);
    editor.deleteSelection();

    expect(getNode(editor.getDocument(), rootId)).toBeDefined();
  });

  it('duplicates a subtree with fresh ids next to the original', () => {
    const { editor, rootId } = makeEditor();
    const frameId = editor.insertPrimitive('frame')!;
    editor.insertPrimitive('text');

    editor.select(frameId);
    const [copyId] = editor.duplicateSelection();

    expect(copyId).toBeDefined();
    expect(copyId).not.toBe(frameId);

    const root = getNode(editor.getDocument(), rootId)!;
    expect(root.children).toEqual([frameId, copyId]);
    expect(getNode(editor.getDocument(), copyId!)!.children).toHaveLength(1);
    expect(validateDocumentIntegrity(editor.getDocument()).ok).toBe(true);
  });

  it('groups and ungroups a selection', () => {
    const { editor, rootId } = makeEditor();
    const a = editor.insertPrimitive('text')!;
    const b = editor.insertPrimitive('text')!;

    editor.select([a, b]);
    const groupId = editor.groupSelection()!;

    expect(getNode(editor.getDocument(), groupId)!.children).toEqual([a, b]);
    expect(getNode(editor.getDocument(), a)!.parent).toBe(groupId);

    editor.select(groupId);
    editor.ungroupSelection();

    expect(getNode(editor.getDocument(), groupId)).toBeUndefined();
    expect(getNode(editor.getDocument(), a)!.parent).toBe(rootId);
  });

  it('writes styles to the active breakpoint only', () => {
    const { editor } = makeEditor();
    const id = editor.insertPrimitive('frame')!;

    editor.setStyle({ gap: 8 });
    editor.setBreakpoint('lg');
    editor.setStyle({ gap: 32 });

    const node = getNode(editor.getDocument(), id)!;
    expect(node.style.gap).toBe(8);
    expect(node.responsive?.lg?.gap).toBe(32);
  });

  it('coalesces a drag gesture into one undo step', () => {
    const { editor } = makeEditor();
    const id = editor.insertPrimitive('frame')!;

    for (const gap of [4, 8, 12, 16, 20]) {
      editor.setStyle({ gap }, { mergeKey: `gap:${id}` });
    }

    editor.undo();
    expect(getNode(editor.getDocument(), id)!.style.gap).toBeUndefined();
    expect(getNode(editor.getDocument(), id)).toBeDefined();
  });

  it('toggles visibility and lock', () => {
    const { editor } = makeEditor();
    const id = editor.insertPrimitive('frame')!;

    editor.toggleVisibility(id);
    expect(getNode(editor.getDocument(), id)!.hidden).toBe(true);

    editor.toggleLock(id);
    expect(getNode(editor.getDocument(), id)!.locked).toBe(true);
  });
});

describe('alignment', () => {
  it('aligns using measured geometry', () => {
    const { editor } = makeEditor();
    const a = editor.insertPrimitive('frame')!;
    editor.clearSelection();
    const b = editor.insertPrimitive('frame')!;

    editor.setMeasuredRects(
      new Map([
        [a, { x: 10, y: 0, width: 100, height: 50 }],
        [b, { x: 200, y: 80, width: 60, height: 50 }],
      ]),
    );

    editor.select([a, b]);
    editor.alignSelection('left');

    expect(getNode(editor.getDocument(), a)!.style.x).toBe(10);
    expect(getNode(editor.getDocument(), b)!.style.x).toBe(10);
  });

  it('does nothing with fewer than two measured rects', () => {
    const { editor } = makeEditor();
    const a = editor.insertPrimitive('frame')!;
    editor.select(a);
    editor.alignSelection('left');
    expect(getNode(editor.getDocument(), a)!.style.x).toBeUndefined();
  });
});

describe('viewport', () => {
  it('keeps the anchor stable while zooming', () => {
    const { editor } = makeEditor();
    editor.setViewport({ offset: { x: 0, y: 0 }, zoom: 1 });
    editor.zoomBy(2, { x: 400, y: 300 });
    expect(editor.getState().viewport.zoom).toBe(2);
  });

  it('clamps zoom to the supported range', () => {
    const { editor } = makeEditor();
    editor.setZoom(100);
    expect(editor.getState().viewport.zoom).toBe(8);
  });
});

describe('cloneSubtree', () => {
  it('rewires internal references to the copies', () => {
    const { editor } = makeEditor();
    const parentId = editor.insertPrimitive('frame')!;
    const childId = editor.insertPrimitive('text')!;

    const clone = cloneSubtree(editor.getDocument(), parentId);
    const byId = new Map(clone.nodes.map((n) => [n.id, n]));
    const root = byId.get(clone.rootId)!;

    expect(root.children).toHaveLength(1);
    expect(root.children[0]).not.toBe(childId);
    expect(byId.get(root.children[0]!)!.parent).toBe(clone.rootId);
    expect(root.parent).toBeNull();
  });
});

describe('keymap', () => {
  it('binds every shortcut to a unique combo', () => {
    const combos = BINDINGS.map((b) => b.keys);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('normalizes events into combos', () => {
    const event = { key: 'Z', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    expect(eventToCombo(event as unknown as KeyboardEvent)).toContain('shift+z');
  });

  it('formats combos for display', () => {
    expect(formatCombo('mod+shift+z')).toMatch(/Z$/);
  });
});

describe('block vs primitive insertion', () => {
  it('stacks blocks at page level instead of nesting them', async () => {
    const { editor, rootId } = makeEditor();

    const navbarId = editor.insertBlock('lib:navbar')!;
    const heroId = editor.insertBlock('lib:hero-centered')!;
    const pricingId = editor.insertBlock('lib:pricing-table')!;

    const root = getNode(editor.getDocument(), rootId)!;
    expect(root.children).toEqual([navbarId, heroId, pricingId]);

    for (const id of [navbarId, heroId, pricingId]) {
      expect(getNode(editor.getDocument(), id)!.parent).toBe(rootId);
    }
  });

  it('inserts a block after the section containing a nested selection', () => {
    const { editor, rootId } = makeEditor();

    const navbarId = editor.insertBlock('lib:navbar')!;
    const footerId = editor.insertBlock('lib:footer')!;

    // Select something deep inside the navbar, then insert.
    const deepChild = getNode(editor.getDocument(), navbarId)!.children[0]!;
    editor.select(deepChild);
    const heroId = editor.insertBlock('lib:hero-centered')!;

    const root = getNode(editor.getDocument(), rootId)!;
    expect(root.children).toEqual([navbarId, heroId, footerId]);
  });

  it('still nests primitives inside a selected container', () => {
    const { editor } = makeEditor();
    const frameId = editor.insertPrimitive('frame')!;
    const textId = editor.insertPrimitive('text')!;
    expect(getNode(editor.getDocument(), textId)!.parent).toBe(frameId);
  });
});
