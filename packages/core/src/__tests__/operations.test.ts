import { beforeEach, describe, expect, it } from 'vitest';
import { createDocument, createNode, collectSubtree, resolveStyle } from '../document.js';
import { applyOperation, applyOperations, type Operation } from '../operations.js';
import { resetIdRng, seededRng, setIdRng } from '../id.js';
import { validateDocumentIntegrity } from '../schema.js';
import type { DesignDocument, SceneNode } from '../types.js';

function seed(): DesignDocument {
  setIdRng(seededRng(42));
  return createDocument({ name: 'Test' });
}

function insertChild(doc: DesignDocument, parentId: string, node: SceneNode) {
  const op: Operation = {
    type: 'insertSubtree',
    nodes: [node],
    rootId: node.id,
    parentId,
    index: 0,
  };
  return applyOperation(doc, op);
}

describe('document creation', () => {
  beforeEach(() => resetIdRng());

  it('creates a valid single-page document', () => {
    const doc = seed();
    expect(doc.pages).toHaveLength(1);
    expect(doc.nodes[doc.pages[0]!.rootId]).toBeDefined();
    expect(validateDocumentIntegrity(doc).ok).toBe(true);
  });

  it('is deterministic under a seeded rng', () => {
    const a = seed();
    const b = seed();
    expect(a.pages[0]!.rootId).toBe(b.pages[0]!.rootId);
  });
});

describe('insert / remove', () => {
  it('links a subtree into its parent and restores it on undo', () => {
    const doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const child = createNode({ type: 'text', props: { text: 'hello' } });

    const inserted = insertChild(doc, rootId, child);
    expect(inserted.document.nodes[rootId]!.children).toEqual([child.id]);
    expect(inserted.document.nodes[child.id]!.parent).toBe(rootId);

    const undone = applyOperations(inserted.document, inserted.inverse);
    expect(undone.document.nodes[child.id]).toBeUndefined();
    expect(undone.document.nodes[rootId]!.children).toEqual([]);
  });

  it('removes an entire subtree and round-trips it exactly', () => {
    let doc = seed();
    const rootId = doc.pages[0]!.rootId;

    const section = createNode({ type: 'frame', name: 'Section' });
    const a = createNode({ type: 'text', props: { text: 'a' } });
    const b = createNode({ type: 'text', props: { text: 'b' } });
    section.children = [a.id, b.id];
    a.parent = section.id;
    b.parent = section.id;

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [section, a, b],
      rootId: section.id,
      parentId: rootId,
      index: 0,
    }).document;

    expect(collectSubtree(doc, section.id)).toEqual([section.id, a.id, b.id]);

    const removed = applyOperation(doc, { type: 'removeSubtree', nodeId: section.id });
    expect(Object.keys(removed.document.nodes)).toEqual([rootId]);

    const restored = applyOperations(removed.document, removed.inverse).document;
    expect(restored.nodes[a.id]!.props.text).toBe('a');
    expect(restored.nodes[section.id]!.children).toEqual([a.id, b.id]);
    expect(validateDocumentIntegrity(restored).ok).toBe(true);
  });

  it('refuses to remove a page root', () => {
    const doc = seed();
    expect(() =>
      applyOperation(doc, { type: 'removeSubtree', nodeId: doc.pages[0]!.rootId }),
    ).toThrow(/page root/);
  });

  it('rejects duplicate node ids', () => {
    const doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'text' });
    const once = insertChild(doc, rootId, node).document;
    expect(() => insertChild(once, rootId, node)).toThrow(/duplicate node id/);
  });
});

describe('moveNode', () => {
  it('reparents and inverts back to the original slot', () => {
    let doc = seed();
    const rootId = doc.pages[0]!.rootId;

    const left = createNode({ type: 'frame', name: 'Left' });
    const right = createNode({ type: 'frame', name: 'Right' });
    const item = createNode({ type: 'text' });

    doc = insertChild(doc, rootId, left).document;
    doc = insertChild(doc, rootId, right).document;
    doc = insertChild(doc, left.id, item).document;

    const moved = applyOperation(doc, {
      type: 'moveNode',
      nodeId: item.id,
      parentId: right.id,
      index: 0,
    });

    expect(moved.document.nodes[right.id]!.children).toEqual([item.id]);
    expect(moved.document.nodes[left.id]!.children).toEqual([]);

    const back = applyOperations(moved.document, moved.inverse).document;
    expect(back.nodes[left.id]!.children).toEqual([item.id]);
    expect(back.nodes[item.id]!.parent).toBe(left.id);
  });

  it('refuses to move a node into its own descendant', () => {
    let doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const outer = createNode({ type: 'frame' });
    const inner = createNode({ type: 'frame' });

    doc = insertChild(doc, rootId, outer).document;
    doc = insertChild(doc, outer.id, inner).document;

    expect(() =>
      applyOperation(doc, { type: 'moveNode', nodeId: outer.id, parentId: inner.id, index: 0 }),
    ).toThrow(/own subtree/);
  });
});

describe('style updates', () => {
  it('merges base style and inverts to the prior value', () => {
    let doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'frame', style: { gap: 8 } });
    doc = insertChild(doc, rootId, node).document;

    const updated = applyOperation(doc, {
      type: 'updateStyle',
      nodeId: node.id,
      style: { gap: 24, background: '{color.card}' },
    });

    expect(updated.document.nodes[node.id]!.style).toMatchObject({
      gap: 24,
      background: '{color.card}',
    });

    const reverted = applyOperations(updated.document, updated.inverse).document;
    expect(reverted.nodes[node.id]!.style.gap).toBe(8);
    expect(reverted.nodes[node.id]!.style.background).toBeUndefined();
  });

  it('writes breakpoint overrides without touching the base style', () => {
    let doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const node = createNode({ type: 'frame', style: { direction: 'column' } });
    doc = insertChild(doc, rootId, node).document;

    doc = applyOperation(doc, {
      type: 'updateStyle',
      nodeId: node.id,
      style: { direction: 'row' },
      breakpoint: 'lg',
    }).document;

    const updated = doc.nodes[node.id]!;
    expect(updated.style.direction).toBe('column');
    expect(resolveStyle(updated, 'md').direction).toBe('column');
    expect(resolveStyle(updated, 'lg').direction).toBe('row');
    expect(resolveStyle(updated, 'xl').direction).toBe('row');
  });
});

describe('tokens', () => {
  it('sets a nested token and restores the previous value', () => {
    const doc = seed();
    const updated = applyOperation(doc, {
      type: 'setToken',
      path: 'color.primary.500',
      value: '#ff0055',
    });

    expect(
      (updated.document.tokens.color as Record<string, Record<string, string>>).primary![500],
    ).toBe('#ff0055');

    const reverted = applyOperations(updated.document, updated.inverse).document;
    expect((reverted.tokens.color as Record<string, Record<string, string>>).primary![500]).toBe(
      '#6366f1',
    );
  });
});

describe('applyOperations', () => {
  it('produces an inverse that rewinds the whole batch in one go', () => {
    const doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const a = createNode({ type: 'frame', name: 'A' });
    const b = createNode({ type: 'frame', name: 'B' });

    const batch: Operation[] = [
      { type: 'insertSubtree', nodes: [a], rootId: a.id, parentId: rootId, index: 0 },
      { type: 'insertSubtree', nodes: [b], rootId: b.id, parentId: rootId, index: 1 },
      { type: 'setNodeFields', nodeId: a.id, fields: { name: 'Renamed' } },
    ];

    const applied = applyOperations(doc, batch);
    expect(applied.document.nodes[a.id]!.name).toBe('Renamed');
    expect(applied.document.nodes[rootId]!.children).toEqual([a.id, b.id]);

    const rewound = applyOperations(applied.document, applied.inverse).document;
    expect(Object.keys(rewound.nodes)).toEqual([rootId]);
  });

  it('leaves the document untouched when an op in the batch is invalid', () => {
    const doc = seed();
    const rootId = doc.pages[0]!.rootId;
    const good = createNode({ type: 'frame' });

    expect(() =>
      applyOperations(doc, [
        { type: 'insertSubtree', nodes: [good], rootId: good.id, parentId: rootId, index: 0 },
        { type: 'removeSubtree', nodeId: 'does-not-exist' },
      ]),
    ).toThrow();

    // The caller keeps the original reference; nothing was mutated in place.
    expect(Object.keys(doc.nodes)).toEqual([rootId]);
  });
});
