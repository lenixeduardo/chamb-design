import { describe, expect, it, vi } from 'vitest';
import { createDocument, createNode } from '../document.js';
import { DocumentStore } from '../store.js';
import type { Operation } from '../operations.js';

function makeStore() {
  const doc = createDocument({ name: 'Store test' });
  const store = new DocumentStore(doc, { autoSnapshotEvery: 0 });
  return { store, rootId: doc.pages[0]!.rootId };
}

function insert(rootId: string, name: string): { ops: Operation[]; id: string } {
  const node = createNode({ type: 'frame', name });
  return {
    id: node.id,
    ops: [{ type: 'insertSubtree', nodes: [node], rootId: node.id, parentId: rootId, index: 0 }],
  };
}

describe('DocumentStore', () => {
  it('applies a transaction and notifies subscribers', () => {
    const { store, rootId } = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const { ops, id } = insert(rootId, 'Hero');
    const commit = store.transact(ops, { label: 'Add hero' });

    expect(commit?.label).toBe('Add hero');
    expect(store.getDocument().nodes[id]).toBeDefined();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'change' }));
  });

  it('undoes and redoes a transaction', () => {
    const { store, rootId } = makeStore();
    const { ops, id } = insert(rootId, 'Hero');
    store.transact(ops, { label: 'Add hero' });

    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.getDocument().nodes[id]).toBeUndefined();

    expect(store.canRedo).toBe(true);
    store.redo();
    expect(store.getDocument().nodes[id]).toBeDefined();
  });

  it('collapses rapid transactions that share a merge key', () => {
    const { store, rootId } = makeStore();
    const { ops, id } = insert(rootId, 'Box');
    store.transact(ops, { label: 'Add box' });

    for (const gap of [4, 8, 12, 16]) {
      store.transact([{ type: 'updateStyle', nodeId: id, style: { gap } }], {
        label: 'Resize gap',
        mergeKey: `gap:${id}`,
      });
    }

    // One commit for the insert, one for the whole drag gesture.
    expect(store.getHistory()).toHaveLength(2);
    expect(store.getDocument().nodes[id]!.style.gap).toBe(16);

    store.undo();
    expect(store.getDocument().nodes[id]!.style.gap).toBeUndefined();
  });

  it('rejects an invalid transaction without mutating the document', () => {
    const { store } = makeStore();
    const before = store.getDocument();
    const onEvent = vi.fn();
    store.subscribe(onEvent);

    expect(() =>
      store.transact([{ type: 'removeSubtree', nodeId: 'nope' }], { label: 'Broken' }),
    ).toThrow();

    expect(store.getDocument()).toBe(before);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('snapshots and restores project state', () => {
    const { store, rootId } = makeStore();
    const snapshot = store.createSnapshot('Before changes');

    const { ops, id } = insert(rootId, 'Later');
    store.transact(ops, { label: 'Add later' });
    expect(store.getDocument().nodes[id]).toBeDefined();

    store.restoreSnapshot(snapshot.id);
    expect(store.getDocument().nodes[id]).toBeUndefined();
  });

  it('forks a branch and keeps edits isolated per branch', () => {
    const { store, rootId } = makeStore();
    const main = store.getCurrentBranch();

    const experiment = store.createBranch('experiment');
    store.checkoutBranch(experiment.id);

    const { ops, id } = insert(rootId, 'Experimental hero');
    store.transact(ops, { label: 'Experiment' });
    expect(store.getDocument().nodes[id]).toBeDefined();

    store.checkoutBranch(main.id);
    expect(store.getDocument().nodes[id]).toBeUndefined();
  });
});
