import { createId } from './id.js';
import { defaultTokens, defaultThemes } from './default-tokens.js';
import {
  DOCUMENT_SCHEMA_VERSION,
  type Breakpoint,
  type DesignDocument,
  type NodeId,
  type Page,
  type PrimitiveType,
  type SceneNode,
  type StyleMap,
} from './types.js';

export interface CreateNodeInput {
  type: PrimitiveType | (string & {});
  name?: string;
  props?: Record<string, unknown>;
  style?: StyleMap;
  className?: string;
  id?: NodeId;
}

export function createNode(input: CreateNodeInput): SceneNode {
  return {
    id: input.id ?? createId(),
    type: input.type,
    name: input.name ?? defaultNameFor(input.type),
    parent: null,
    children: [],
    props: input.props ?? {},
    style: input.style ?? {},
    ...(input.className ? { className: input.className } : {}),
  };
}

function defaultNameFor(type: string): string {
  const base = type.includes(':') ? (type.split(':')[1] ?? type) : type;
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface CreateDocumentInput {
  name?: string;
  id?: string;
  pageName?: string;
}

export function createDocument(input: CreateDocumentInput = {}): DesignDocument {
  const root = createNode({
    type: 'frame',
    name: 'Page',
    style: {
      display: 'flex',
      direction: 'column',
      width: 'fill',
      minHeight: '100vh',
      background: '{color.background}',
      color: '{color.foreground}',
    },
  });

  const page: Page = {
    id: createId('page'),
    name: input.pageName ?? 'Home',
    path: '/',
    rootId: root.id,
    canvas: { width: 1440, height: 900 },
  };

  const now = new Date().toISOString();

  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: input.id ?? createId('doc'),
    name: input.name ?? 'Untitled project',
    pages: [page],
    nodes: { [root.id]: root },
    tokens: defaultTokens(),
    themes: defaultThemes(),
    activeThemeId: 'dark',
    assets: [],
    components: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Traversal                                  */
/* -------------------------------------------------------------------------- */

export function getNode(doc: DesignDocument, id: NodeId): SceneNode | undefined {
  return doc.nodes[id];
}

/** Throws when the node is missing — use inside operations where absence is a bug. */
export function requireNode(doc: DesignDocument, id: NodeId): SceneNode {
  const node = doc.nodes[id];
  if (!node) throw new Error(`[opendesign] node not found: ${id}`);
  return node;
}

export function getPage(doc: DesignDocument, pageId: string): Page | undefined {
  return doc.pages.find((p) => p.id === pageId);
}

/** Depth-first walk. Return `false` from the visitor to skip a subtree. */
export function walk(
  doc: DesignDocument,
  rootId: NodeId,
  visit: (node: SceneNode, depth: number) => void | boolean,
  depth = 0,
): void {
  const node = doc.nodes[rootId];
  if (!node) return;
  if (visit(node, depth) === false) return;
  for (const childId of node.children) walk(doc, childId, visit, depth + 1);
}

/** All ids in a subtree, parents before children. */
export function collectSubtree(doc: DesignDocument, rootId: NodeId): NodeId[] {
  const ids: NodeId[] = [];
  walk(doc, rootId, (node) => {
    ids.push(node.id);
  });
  return ids;
}

/** Node ids from the document root down to `id`, inclusive. */
export function getAncestors(doc: DesignDocument, id: NodeId): NodeId[] {
  const chain: NodeId[] = [];
  let current = doc.nodes[id]?.parent ?? null;
  while (current) {
    chain.unshift(current);
    current = doc.nodes[current]?.parent ?? null;
  }
  return chain;
}

export function isDescendantOf(doc: DesignDocument, id: NodeId, maybeAncestor: NodeId): boolean {
  let current = doc.nodes[id]?.parent ?? null;
  while (current) {
    if (current === maybeAncestor) return true;
    current = doc.nodes[current]?.parent ?? null;
  }
  return false;
}

export function findPageOfNode(doc: DesignDocument, id: NodeId): Page | undefined {
  const ancestors = [...getAncestors(doc, id), id];
  return doc.pages.find((page) => ancestors.includes(page.rootId));
}

/** Nodes whose name or type matches `query`, for the global search palette. */
export function searchNodes(doc: DesignDocument, query: string, limit = 50): SceneNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SceneNode[] = [];
  for (const node of Object.values(doc.nodes)) {
    const text = typeof node.props.text === 'string' ? node.props.text : '';
    if (
      node.name.toLowerCase().includes(q) ||
      node.type.toLowerCase().includes(q) ||
      text.toLowerCase().includes(q)
    ) {
      out.push(node);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                             Style resolution                               */
/* -------------------------------------------------------------------------- */

const CASCADE: Breakpoint[] = ['base', 'sm', 'md', 'lg', 'xl', '2xl'];

/**
 * Merges a node's base style with every responsive override up to and
 * including `breakpoint` (mobile-first cascade, exactly like Tailwind).
 */
export function resolveStyle(node: SceneNode, breakpoint: Breakpoint = 'base'): StyleMap {
  if (breakpoint === 'base' || !node.responsive) return node.style;
  const upTo = CASCADE.slice(0, CASCADE.indexOf(breakpoint) + 1);
  let style: StyleMap = { ...node.style };
  for (const bp of upTo) {
    if (bp === 'base') continue;
    const override = node.responsive[bp];
    if (override) style = mergeStyle(style, override);
  }
  return style;
}

/** Shallow merge with one level of depth for nested groups (padding, font, ...). */
export function mergeStyle(base: StyleMap, override: StyleMap): StyleMap {
  const out: StyleMap = { ...base };
  for (const [key, value] of Object.entries(override) as [keyof StyleMap, unknown][]) {
    if (value === undefined) continue;
    const current = out[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      (out as Record<string, unknown>)[key] = { ...current, ...value };
    } else {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/*                                Statistics                                  */
/* -------------------------------------------------------------------------- */

export interface DocumentStats {
  pages: number;
  nodes: number;
  assets: number;
  components: number;
  maxDepth: number;
}

export function documentStats(doc: DesignDocument): DocumentStats {
  let maxDepth = 0;
  for (const page of doc.pages) {
    walk(doc, page.rootId, (_node, depth) => {
      if (depth > maxDepth) maxDepth = depth;
    });
  }
  return {
    pages: doc.pages.length,
    nodes: Object.keys(doc.nodes).length,
    assets: doc.assets.length,
    components: doc.components.length,
    maxDepth,
  };
}

/**
 * Drops nodes that are unreachable from any page root or component root.
 *
 * Streaming AI patches can abort mid-flight and leave orphans behind; the store
 * runs this after every AI transaction.
 */
export function pruneOrphans(doc: DesignDocument): DesignDocument {
  const reachable = new Set<NodeId>();
  const roots = [...doc.pages.map((p) => p.rootId), ...doc.components.map((c) => c.rootId)];
  for (const rootId of roots) {
    for (const id of collectSubtree(doc, rootId)) reachable.add(id);
  }
  if (reachable.size === Object.keys(doc.nodes).length) return doc;

  const nodes: Record<NodeId, SceneNode> = {};
  for (const id of reachable) {
    const node = doc.nodes[id];
    if (node) nodes[id] = node;
  }
  return { ...doc, nodes };
}
