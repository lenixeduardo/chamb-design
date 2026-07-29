import { collectSubtree, isDescendantOf, requireNode } from './document.js';
import type {
  Asset,
  Breakpoint,
  ComponentDef,
  DesignDocument,
  NodeId,
  Page,
  SceneNode,
  StyleMap,
  ThemeDef,
} from './types.js';

/**
 * Every mutation to a document goes through an `Operation`.
 *
 * Operations are plain data, which buys us four things at once:
 *   1. undo/redo without snapshots — each op yields its own inverse;
 *   2. AI edits as data — a model returns ops, we validate then apply them;
 *   3. an audit log that can be replayed, diffed and branched;
 *   4. a natural wire format for realtime collaboration.
 */
export type Operation =
  | {
      type: 'insertSubtree';
      /** Root first; every node must be reachable from `rootId`. */
      nodes: SceneNode[];
      rootId: NodeId;
      parentId: NodeId | null;
      index: number;
    }
  | { type: 'removeSubtree'; nodeId: NodeId }
  | { type: 'moveNode'; nodeId: NodeId; parentId: NodeId; index: number }
  | { type: 'reorderChildren'; nodeId: NodeId; children: NodeId[] }
  | {
      type: 'updateProps';
      nodeId: NodeId;
      /** Shallow merge. An explicit `null` deletes the key. */
      props: Record<string, unknown>;
    }
  | {
      type: 'updateStyle';
      nodeId: NodeId;
      style: StyleMap;
      /** Defaults to `base`; anything else writes into `responsive`. */
      breakpoint?: Breakpoint;
    }
  | { type: 'setNodeFields'; nodeId: NodeId; fields: NodeFieldPatch }
  | { type: 'addPage'; page: Page; nodes: SceneNode[]; index: number }
  | { type: 'removePage'; pageId: string }
  | { type: 'updatePage'; pageId: string; patch: Partial<Omit<Page, 'id' | 'rootId'>> }
  | { type: 'setToken'; path: string; value: string | number | null }
  | { type: 'setThemes'; themes: ThemeDef[]; activeThemeId: string }
  | { type: 'addAsset'; asset: Asset }
  | { type: 'removeAsset'; assetId: string }
  | { type: 'upsertComponent'; component: ComponentDef; nodes?: SceneNode[] }
  | { type: 'removeComponent'; componentId: string }
  | { type: 'setDocumentFields'; fields: Partial<Pick<DesignDocument, 'name' | 'meta'>> };

export type NodeFieldPatch = Partial<
  Pick<
    SceneNode,
    'name' | 'className' | 'locked' | 'hidden' | 'constraints' | 'motion' | 'meta' | 'overrides'
  >
>;

export interface ApplyResult {
  document: DesignDocument;
  /** Ops that, applied in order, restore the previous document state. */
  inverse: Operation[];
}

export class OperationError extends Error {
  constructor(
    message: string,
    readonly operation: Operation,
  ) {
    super(`[opendesign] ${message}`);
    this.name = 'OperationError';
  }
}

/** Applies one operation immutably and returns the inverse for the undo stack. */
export function applyOperation(doc: DesignDocument, op: Operation): ApplyResult {
  switch (op.type) {
    case 'insertSubtree':
      return applyInsertSubtree(doc, op);
    case 'removeSubtree':
      return applyRemoveSubtree(doc, op);
    case 'moveNode':
      return applyMoveNode(doc, op);
    case 'reorderChildren':
      return applyReorderChildren(doc, op);
    case 'updateProps':
      return applyUpdateProps(doc, op);
    case 'updateStyle':
      return applyUpdateStyle(doc, op);
    case 'setNodeFields':
      return applySetNodeFields(doc, op);
    case 'addPage':
      return applyAddPage(doc, op);
    case 'removePage':
      return applyRemovePage(doc, op);
    case 'updatePage':
      return applyUpdatePage(doc, op);
    case 'setToken':
      return applySetToken(doc, op);
    case 'setThemes':
      return applySetThemes(doc, op);
    case 'addAsset':
      return applyAddAsset(doc, op);
    case 'removeAsset':
      return applyRemoveAsset(doc, op);
    case 'upsertComponent':
      return applyUpsertComponent(doc, op);
    case 'removeComponent':
      return applyRemoveComponent(doc, op);
    case 'setDocumentFields':
      return applySetDocumentFields(doc, op);
  }
}

/** Applies a batch, accumulating a single inverse list (already reversed). */
export function applyOperations(doc: DesignDocument, ops: Operation[]): ApplyResult {
  let current = doc;
  const inverse: Operation[] = [];
  for (const op of ops) {
    const result = applyOperation(current, op);
    current = result.document;
    // Undo runs newest-first, so prepend.
    inverse.unshift(...result.inverse);
  }
  return { document: current, inverse };
}

/* -------------------------------------------------------------------------- */
/*                                  Handlers                                  */
/* -------------------------------------------------------------------------- */

function touch(doc: DesignDocument): DesignDocument {
  return { ...doc, updatedAt: new Date().toISOString() };
}

function applyInsertSubtree(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'insertSubtree' }>,
): ApplyResult {
  if (op.nodes.length === 0) throw new OperationError('insertSubtree with no nodes', op);
  if (!op.nodes.some((n) => n.id === op.rootId)) {
    throw new OperationError(`rootId ${op.rootId} is not part of nodes`, op);
  }

  const nodes = { ...doc.nodes };
  for (const node of op.nodes) {
    if (nodes[node.id]) throw new OperationError(`duplicate node id ${node.id}`, op);
    nodes[node.id] = { ...node };
  }

  const root = nodes[op.rootId]!;
  nodes[op.rootId] = { ...root, parent: op.parentId };

  if (op.parentId) {
    const parent = nodes[op.parentId];
    if (!parent) throw new OperationError(`parent ${op.parentId} not found`, op);
    const children = [...parent.children];
    const index = clamp(op.index, 0, children.length);
    children.splice(index, 0, op.rootId);
    nodes[op.parentId] = { ...parent, children };
  }

  return {
    document: touch({ ...doc, nodes }),
    inverse: [{ type: 'removeSubtree', nodeId: op.rootId }],
  };
}

function applyRemoveSubtree(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'removeSubtree' }>,
): ApplyResult {
  const node = requireNode(doc, op.nodeId);
  if (doc.pages.some((p) => p.rootId === op.nodeId)) {
    throw new OperationError('cannot remove a page root; use removePage', op);
  }

  const ids = collectSubtree(doc, op.nodeId);
  const captured = ids.map((id) => ({ ...requireNode(doc, id) }));

  const nodes = { ...doc.nodes };
  for (const id of ids) delete nodes[id];

  let index = 0;
  if (node.parent) {
    const parent = nodes[node.parent];
    if (parent) {
      index = parent.children.indexOf(op.nodeId);
      nodes[node.parent] = {
        ...parent,
        children: parent.children.filter((id) => id !== op.nodeId),
      };
    }
  }

  return {
    document: touch({ ...doc, nodes }),
    inverse: [
      {
        type: 'insertSubtree',
        nodes: captured,
        rootId: op.nodeId,
        parentId: node.parent,
        index: Math.max(index, 0),
      },
    ],
  };
}

function applyMoveNode(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'moveNode' }>,
): ApplyResult {
  const node = requireNode(doc, op.nodeId);
  requireNode(doc, op.parentId);

  if (op.parentId === op.nodeId || isDescendantOf(doc, op.parentId, op.nodeId)) {
    throw new OperationError('cannot move a node into its own subtree', op);
  }

  const previousParent = node.parent;
  const previousIndex = previousParent
    ? (doc.nodes[previousParent]?.children.indexOf(op.nodeId) ?? 0)
    : 0;

  const nodes = { ...doc.nodes };

  if (previousParent) {
    const parent = nodes[previousParent]!;
    nodes[previousParent] = {
      ...parent,
      children: parent.children.filter((id) => id !== op.nodeId),
    };
  }

  const target = nodes[op.parentId]!;
  const children = [...target.children];
  children.splice(clamp(op.index, 0, children.length), 0, op.nodeId);
  nodes[op.parentId] = { ...target, children };
  nodes[op.nodeId] = { ...node, parent: op.parentId };

  const inverse: Operation[] = previousParent
    ? [{ type: 'moveNode', nodeId: op.nodeId, parentId: previousParent, index: previousIndex }]
    : [{ type: 'removeSubtree', nodeId: op.nodeId }];

  return { document: touch({ ...doc, nodes }), inverse };
}

function applyReorderChildren(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'reorderChildren' }>,
): ApplyResult {
  const node = requireNode(doc, op.nodeId);
  const before = [...node.children];

  if (before.length !== op.children.length || !op.children.every((id) => before.includes(id))) {
    throw new OperationError('reorderChildren must be a permutation of current children', op);
  }

  return {
    document: touch({
      ...doc,
      nodes: { ...doc.nodes, [op.nodeId]: { ...node, children: [...op.children] } },
    }),
    inverse: [{ type: 'reorderChildren', nodeId: op.nodeId, children: before }],
  };
}

function applyUpdateProps(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'updateProps' }>,
): ApplyResult {
  const node = requireNode(doc, op.nodeId);
  const props = { ...node.props };
  const previous: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(op.props)) {
    previous[key] = key in props ? props[key] : null;
    if (value === null) delete props[key];
    else props[key] = value;
  }

  return {
    document: touch({ ...doc, nodes: { ...doc.nodes, [op.nodeId]: { ...node, props } } }),
    inverse: [{ type: 'updateProps', nodeId: op.nodeId, props: previous }],
  };
}

function applyUpdateStyle(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'updateStyle' }>,
): ApplyResult {
  const node = requireNode(doc, op.nodeId);
  const breakpoint = op.breakpoint ?? 'base';

  const target: StyleMap =
    breakpoint === 'base' ? node.style : (node.responsive?.[breakpoint] ?? {});

  const next = { ...target };
  const previous: StyleMap = {};

  for (const [key, value] of Object.entries(op.style) as [keyof StyleMap, unknown][]) {
    (previous as Record<string, unknown>)[key] = target[key] ?? undefined;
    if (value === undefined || value === null) delete next[key];
    else (next as Record<string, unknown>)[key] = value;
  }

  const updated: SceneNode =
    breakpoint === 'base'
      ? { ...node, style: next }
      : { ...node, responsive: { ...node.responsive, [breakpoint]: next } };

  return {
    document: touch({ ...doc, nodes: { ...doc.nodes, [op.nodeId]: updated } }),
    inverse: [{ type: 'updateStyle', nodeId: op.nodeId, style: previous, breakpoint }],
  };
}

function applySetNodeFields(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'setNodeFields' }>,
): ApplyResult {
  const node = requireNode(doc, op.nodeId);
  const previous: NodeFieldPatch = {};

  for (const key of Object.keys(op.fields) as (keyof NodeFieldPatch)[]) {
    (previous as Record<string, unknown>)[key] = node[key];
  }

  return {
    document: touch({
      ...doc,
      nodes: { ...doc.nodes, [op.nodeId]: { ...node, ...op.fields } },
    }),
    inverse: [{ type: 'setNodeFields', nodeId: op.nodeId, fields: previous }],
  };
}

function applyAddPage(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'addPage' }>,
): ApplyResult {
  if (doc.pages.some((p) => p.id === op.page.id)) {
    throw new OperationError(`page ${op.page.id} already exists`, op);
  }
  if (doc.pages.some((p) => p.path === op.page.path)) {
    throw new OperationError(`page path ${op.page.path} is already taken`, op);
  }

  const nodes = { ...doc.nodes };
  for (const node of op.nodes) nodes[node.id] = { ...node };
  if (!nodes[op.page.rootId]) {
    throw new OperationError(`page root ${op.page.rootId} missing from nodes`, op);
  }

  const pages = [...doc.pages];
  pages.splice(clamp(op.index, 0, pages.length), 0, op.page);

  return {
    document: touch({ ...doc, pages, nodes }),
    inverse: [{ type: 'removePage', pageId: op.page.id }],
  };
}

function applyRemovePage(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'removePage' }>,
): ApplyResult {
  const index = doc.pages.findIndex((p) => p.id === op.pageId);
  if (index === -1) throw new OperationError(`page ${op.pageId} not found`, op);
  if (doc.pages.length === 1) throw new OperationError('cannot remove the last page', op);

  const page = doc.pages[index]!;
  const ids = collectSubtree(doc, page.rootId);
  const captured = ids.map((id) => ({ ...requireNode(doc, id) }));

  const nodes = { ...doc.nodes };
  for (const id of ids) delete nodes[id];

  return {
    document: touch({ ...doc, pages: doc.pages.filter((p) => p.id !== op.pageId), nodes }),
    inverse: [{ type: 'addPage', page, nodes: captured, index }],
  };
}

function applyUpdatePage(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'updatePage' }>,
): ApplyResult {
  const page = doc.pages.find((p) => p.id === op.pageId);
  if (!page) throw new OperationError(`page ${op.pageId} not found`, op);

  const previous: Partial<Page> = {};
  for (const key of Object.keys(op.patch) as (keyof Page)[]) {
    (previous as Record<string, unknown>)[key] = page[key];
  }

  return {
    document: touch({
      ...doc,
      pages: doc.pages.map((p) => (p.id === op.pageId ? { ...p, ...op.patch } : p)),
    }),
    inverse: [{ type: 'updatePage', pageId: op.pageId, patch: previous }],
  };
}

function applySetToken(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'setToken' }>,
): ApplyResult {
  const segments = op.path.split('.');
  if (segments.length < 2) throw new OperationError(`invalid token path "${op.path}"`, op);

  const tokens = structuredClone(doc.tokens) as Record<string, unknown>;
  let cursor = tokens;

  for (const segment of segments.slice(0, -1)) {
    const next = cursor[segment];
    if (typeof next !== 'object' || next === null) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1]!;
  const before = cursor[leaf];
  if (op.value === null) delete cursor[leaf];
  else cursor[leaf] = op.value;

  return {
    document: touch({ ...doc, tokens: tokens as DesignDocument['tokens'] }),
    inverse: [
      {
        type: 'setToken',
        path: op.path,
        value: (before as string | number | undefined) ?? null,
      },
    ],
  };
}

function applySetThemes(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'setThemes' }>,
): ApplyResult {
  return {
    document: touch({ ...doc, themes: op.themes, activeThemeId: op.activeThemeId }),
    inverse: [{ type: 'setThemes', themes: doc.themes, activeThemeId: doc.activeThemeId }],
  };
}

function applyAddAsset(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'addAsset' }>,
): ApplyResult {
  if (doc.assets.some((a) => a.id === op.asset.id)) {
    throw new OperationError(`asset ${op.asset.id} already exists`, op);
  }
  return {
    document: touch({ ...doc, assets: [...doc.assets, op.asset] }),
    inverse: [{ type: 'removeAsset', assetId: op.asset.id }],
  };
}

function applyRemoveAsset(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'removeAsset' }>,
): ApplyResult {
  const asset = doc.assets.find((a) => a.id === op.assetId);
  if (!asset) throw new OperationError(`asset ${op.assetId} not found`, op);
  return {
    document: touch({ ...doc, assets: doc.assets.filter((a) => a.id !== op.assetId) }),
    inverse: [{ type: 'addAsset', asset }],
  };
}

function applyUpsertComponent(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'upsertComponent' }>,
): ApplyResult {
  const existing = doc.components.find((c) => c.id === op.component.id);

  const nodes = { ...doc.nodes };
  for (const node of op.nodes ?? []) nodes[node.id] = { ...node };

  const components = existing
    ? doc.components.map((c) => (c.id === op.component.id ? op.component : c))
    : [...doc.components, op.component];

  return {
    document: touch({ ...doc, components, nodes }),
    inverse: existing
      ? [{ type: 'upsertComponent', component: existing }]
      : [{ type: 'removeComponent', componentId: op.component.id }],
  };
}

function applyRemoveComponent(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'removeComponent' }>,
): ApplyResult {
  const component = doc.components.find((c) => c.id === op.componentId);
  if (!component) throw new OperationError(`component ${op.componentId} not found`, op);

  const ids = collectSubtree(doc, component.rootId);
  const captured = ids.map((id) => ({ ...requireNode(doc, id) }));

  const nodes = { ...doc.nodes };
  for (const id of ids) delete nodes[id];

  return {
    document: touch({
      ...doc,
      components: doc.components.filter((c) => c.id !== op.componentId),
      nodes,
    }),
    inverse: [{ type: 'upsertComponent', component, nodes: captured }],
  };
}

function applySetDocumentFields(
  doc: DesignDocument,
  op: Extract<Operation, { type: 'setDocumentFields' }>,
): ApplyResult {
  const previous: Partial<DesignDocument> = {};
  for (const key of Object.keys(op.fields) as (keyof DesignDocument)[]) {
    (previous as Record<string, unknown>)[key] = doc[key];
  }
  return {
    document: touch({ ...doc, ...op.fields }),
    inverse: [
      { type: 'setDocumentFields', fields: previous as Pick<DesignDocument, 'name' | 'meta'> },
    ],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
