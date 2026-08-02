import {
  DocumentStore,
  alignRects,
  collectSubtree,
  createId,
  createNode,
  distributeRects,
  getNode,
  isDescendantOf,
  requireNode,
  zoomAt,
  type AlignMode,
  type Asset,
  type Breakpoint,
  type ComponentContribution,
  type DesignDocument,
  type GuideAxis,
  type NodeId,
  type Operation,
  type Page,
  type PluginRegistry,
  type Point,
  type Rect,
  type SceneNode,
  type StyleMap,
  type Viewport,
} from '@opendesign/core';
import { placeAsset, type AssetIngestor, type IngestInput } from '@opendesign/assets';

/**
 * Headless editor state.
 *
 * Everything the canvas UI needs that is *not* part of the document: what is
 * selected, where the viewport is, which tool is active, which breakpoint we
 * are editing. Keeping it out of the document matters — selection is per-user
 * and must never end up in an undo step or a collaborator's session.
 */

export type Tool = 'select' | 'hand' | 'frame' | 'text' | 'image' | 'comment';

export interface EditorState {
  selection: NodeId[];
  hoveredId: NodeId | null;
  activePageId: string;
  activeBreakpoint: Breakpoint;
  viewport: Viewport;
  tool: Tool;
  /** Toggles for the canvas chrome. */
  showGrid: boolean;
  snapEnabled: boolean;
  gridSize: number;
}

export type EditorListener = (state: EditorState, document: DesignDocument) => void;

export interface EditorOptions {
  registry?: PluginRegistry;
  initialPageId?: string;
}

export class Editor {
  readonly store: DocumentStore;
  private registry: PluginRegistry | undefined;
  private readonly listeners = new Set<EditorListener>();
  private state: EditorState;
  /** Cached measurements from the DOM, keyed by node id. */
  private rects = new Map<NodeId, Rect>();
  private ingestor: AssetIngestor | undefined;

  constructor(document: DesignDocument, options: EditorOptions = {}) {
    this.store = new DocumentStore(document);
    this.registry = options.registry;

    this.state = {
      selection: [],
      hoveredId: null,
      activePageId: options.initialPageId ?? document.pages[0]?.id ?? '',
      activeBreakpoint: 'base',
      viewport: { offset: { x: -80, y: -80 }, zoom: 0.8 },
      tool: 'select',
      showGrid: false,
      snapEnabled: true,
      gridSize: 8,
    };

    // Document changes are editor changes as far as subscribers are concerned.
    this.store.subscribe(() => this.emit());
  }

  /**
   * Swaps in the plugin registry after construction.
   *
   * Plugins load asynchronously, but the editor must exist immediately so the
   * canvas can render. Rebuilding the Editor once plugins arrive would discard
   * the user's history, so it is injected instead.
   */
  setRegistry(registry: PluginRegistry): void {
    this.registry = registry;
  }

  /* ------------------------------- state -------------------------------- */

  getState(): EditorState {
    return this.state;
  }

  getDocument(): DesignDocument {
    return this.store.getDocument();
  }

  getActivePage(): Page | undefined {
    return this.getDocument().pages.find((p) => p.id === this.state.activePageId);
  }

  subscribe(listener: EditorListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state, this.store.getDocument());
  }

  /* ----------------------------- selection ------------------------------ */

  select(ids: NodeId[] | NodeId | null): void {
    const next = ids === null ? [] : Array.isArray(ids) ? ids : [ids];
    // Selecting both a parent and its descendant makes every transform
    // ambiguous — moving the parent already moves the child. The ancestor wins
    // and nested ids are dropped, which is what every design tool does.
    const document = this.getDocument();
    const filtered = next.filter(
      (id) =>
        getNode(document, id) &&
        !next.some((other) => other !== id && isDescendantOf(document, id, other)),
    );
    this.setState({ selection: filtered });
  }

  addToSelection(id: NodeId): void {
    if (this.state.selection.includes(id)) return;
    this.select([...this.state.selection, id]);
  }

  toggleSelection(id: NodeId): void {
    this.select(
      this.state.selection.includes(id)
        ? this.state.selection.filter((existing) => existing !== id)
        : [...this.state.selection, id],
    );
  }

  clearSelection(): void {
    this.setState({ selection: [] });
  }

  setHovered(id: NodeId | null): void {
    if (this.state.hoveredId === id) return;
    this.setState({ hoveredId: id });
  }

  getSelectedNodes(): SceneNode[] {
    const document = this.getDocument();
    return this.state.selection
      .map((id) => getNode(document, id))
      .filter((node): node is SceneNode => Boolean(node));
  }

  /** Moves selection to the parent — the "select up" gesture (Escape). */
  selectParent(): void {
    const document = this.getDocument();
    const parents = this.state.selection
      .map((id) => getNode(document, id)?.parent)
      .filter((id): id is NodeId => Boolean(id));
    if (parents.length > 0) this.select([...new Set(parents)]);
  }

  selectAll(): void {
    const page = this.getActivePage();
    if (!page) return;
    const root = getNode(this.getDocument(), page.rootId);
    this.select(root?.children ?? []);
  }

  /* ------------------------------ viewport ------------------------------ */

  setViewport(viewport: Viewport): void {
    this.setState({ viewport });
  }

  panBy(delta: Point): void {
    const { offset, zoom } = this.state.viewport;
    this.setState({
      viewport: { zoom, offset: { x: offset.x - delta.x / zoom, y: offset.y - delta.y / zoom } },
    });
  }

  zoomBy(factor: number, anchor: Point): void {
    this.setState({
      viewport: zoomAt(this.state.viewport, anchor, this.state.viewport.zoom * factor),
    });
  }

  setZoom(zoom: number, anchor: Point = { x: 0, y: 0 }): void {
    this.setState({ viewport: zoomAt(this.state.viewport, anchor, zoom) });
  }

  setTool(tool: Tool): void {
    this.setState({ tool });
  }

  setBreakpoint(breakpoint: Breakpoint): void {
    this.setState({ activeBreakpoint: breakpoint });
  }

  setActivePage(pageId: string): void {
    this.setState({ activePageId: pageId, selection: [] });
  }

  toggleGrid(): void {
    this.setState({ showGrid: !this.state.showGrid });
  }

  toggleSnap(): void {
    this.setState({ snapEnabled: !this.state.snapEnabled });
  }

  /** The canvas reports measured geometry here so snapping has real numbers. */
  setMeasuredRects(rects: Map<NodeId, Rect>): void {
    this.rects = rects;
  }

  getRect(id: NodeId): Rect | undefined {
    return this.rects.get(id);
  }

  /* ------------------------------ commands ------------------------------ */

  /**
   * Where a new node should land.
   *
   * Two rules, because the two things being inserted have different intent:
   *
   *   - a **primitive** goes *inside* a selected container — you picked a frame
   *     because you want the text in it;
   *   - a **block** is a whole page section, so it stacks as a sibling at page
   *     level. Nesting a hero inside the navbar you just added is never what
   *     anyone meant, and it is what a naive "into the selection" rule does.
   */
  private insertionTarget(kind: 'primitive' | 'block'): { parentId: NodeId; index: number } | null {
    const document = this.getDocument();
    const page = this.getActivePage();
    if (!page) return null;

    const root = getNode(document, page.rootId);
    const appendToPage = { parentId: page.rootId, index: root?.children.length ?? 0 };

    const [firstId] = this.state.selection;
    if (!firstId) return appendToPage;

    const node = getNode(document, firstId);
    if (!node) return appendToPage;

    if (kind === 'block') {
      // Find the top-level section containing the selection and go after it.
      let cursor: SceneNode = node;
      while (cursor.parent && cursor.parent !== page.rootId) {
        const parent = getNode(document, cursor.parent);
        if (!parent) break;
        cursor = parent;
      }
      const index = root?.children.indexOf(cursor.id) ?? -1;
      return index >= 0 ? { parentId: page.rootId, index: index + 1 } : appendToPage;
    }

    const isContainer = ['frame', 'stack', 'grid', 'slot'].includes(node.type);
    if (isContainer) return { parentId: node.id, index: node.children.length };

    const parentId = node.parent ?? page.rootId;
    const parent = getNode(document, parentId);
    return { parentId, index: (parent?.children.indexOf(node.id) ?? -1) + 1 };
  }

  insertBlock(componentId: string, props?: Record<string, unknown>): NodeId | null {
    const component = this.registry?.getComponent(componentId);
    if (!component) throw new Error(`[opendesign] unknown component: ${componentId}`);
    return this.insertComponent(component, props);
  }

  /**
   * Inserts a subtree that was built somewhere else.
   *
   * A generated section (21st.dev, a paste, an importer) arrives as nodes, not
   * as a component contribution, and it deserves the same treatment as a block
   * dropped from the library: same insertion point, same undo entry, same
   * selection afterwards. Without this it would have to reach into the store
   * directly and would land outside the history.
   */
  insertSubtree(nodes: SceneNode[], rootId: NodeId, label = 'Insert section'): NodeId | null {
    if (nodes.length === 0) return null;

    const target = this.insertionTarget('block');
    if (!target) return null;

    this.store.transact(
      [
        {
          type: 'insertSubtree',
          nodes,
          rootId,
          parentId: target.parentId,
          index: target.index,
        },
      ],
      { label },
    );

    this.select(rootId);
    return rootId;
  }

  insertComponent(
    component: ComponentContribution,
    props?: Record<string, unknown>,
  ): NodeId | null {
    const target = this.insertionTarget('block');
    if (!target) return null;

    const built = component.create({
      createId,
      tokens: this.getDocument().tokens,
      ...(props ? { props } : {}),
    });

    this.store.transact(
      [
        {
          type: 'insertSubtree',
          nodes: built.nodes,
          rootId: built.rootId,
          parentId: target.parentId,
          index: target.index,
        },
      ],
      { label: `Insert ${component.name}` },
    );

    this.select(built.rootId);
    return built.rootId;
  }

  insertPrimitive(type: string, style?: StyleMap): NodeId | null {
    const target = this.insertionTarget('primitive');
    if (!target) return null;

    const node = createNode({
      type,
      ...(style ? { style } : {}),
      ...(type === 'text' ? { props: { text: 'Text' } } : {}),
      ...(type === 'heading' ? { props: { text: 'Heading', level: 'h2' } } : {}),
      ...(type === 'button' ? { props: { text: 'Button' } } : {}),
    });

    this.store.transact(
      [
        {
          type: 'insertSubtree',
          nodes: [node],
          rootId: node.id,
          parentId: target.parentId,
          index: target.index,
        },
      ],
      { label: `Insert ${type}` },
    );

    this.select(node.id);
    return node.id;
  }

  deleteSelection(): void {
    const document = this.getDocument();
    const pageRoots = new Set(document.pages.map((p) => p.rootId));

    const removable = this.state.selection.filter(
      (id) => !pageRoots.has(id) && getNode(document, id),
    );
    if (removable.length === 0) return;

    this.store.transact(
      removable.map((nodeId): Operation => ({ type: 'removeSubtree', nodeId })),
      { label: removable.length === 1 ? 'Delete layer' : `Delete ${removable.length} layers` },
    );

    this.clearSelection();
  }

  duplicateSelection(): NodeId[] {
    const document = this.getDocument();
    const created: NodeId[] = [];
    const ops: Operation[] = [];

    for (const id of this.state.selection) {
      const node = getNode(document, id);
      if (!node || !node.parent) continue;

      const { nodes, rootId } = cloneSubtree(document, id);
      const parent = requireNode(document, node.parent);

      ops.push({
        type: 'insertSubtree',
        nodes,
        rootId,
        parentId: node.parent,
        index: parent.children.indexOf(id) + 1,
      });
      created.push(rootId);
    }

    if (ops.length === 0) return [];
    this.store.transact(ops, { label: 'Duplicate' });
    this.select(created);
    return created;
  }

  /** Wraps the selection in a new auto-layout frame. */
  groupSelection(): NodeId | null {
    const document = this.getDocument();
    const ids = this.state.selection.filter((id) => getNode(document, id)?.parent);
    if (ids.length < 1) return null;

    const first = requireNode(document, ids[0]!);
    const parentId = first.parent!;
    const parent = requireNode(document, parentId);
    const index = Math.min(...ids.map((id) => parent.children.indexOf(id)).filter((i) => i >= 0));

    const group = createNode({
      type: 'frame',
      name: 'Group',
      style: { display: 'flex', direction: 'column', gap: '{spacing.4}' },
    });

    const ops: Operation[] = [
      { type: 'insertSubtree', nodes: [group], rootId: group.id, parentId, index },
      ...ids.map((id, offset): Operation => ({
        type: 'moveNode',
        nodeId: id,
        parentId: group.id,
        index: offset,
      })),
    ];

    this.store.transact(ops, { label: 'Group selection' });
    this.select(group.id);
    return group.id;
  }

  ungroupSelection(): void {
    const document = this.getDocument();
    const ops: Operation[] = [];
    const promoted: NodeId[] = [];

    for (const id of this.state.selection) {
      const node = getNode(document, id);
      if (!node?.parent || node.children.length === 0) continue;

      const parent = requireNode(document, node.parent);
      const baseIndex = parent.children.indexOf(id);

      node.children.forEach((childId, offset) => {
        ops.push({
          type: 'moveNode',
          nodeId: childId,
          parentId: parent.id,
          index: baseIndex + offset,
        });
        promoted.push(childId);
      });
      ops.push({ type: 'removeSubtree', nodeId: id });
    }

    if (ops.length === 0) return;
    this.store.transact(ops, { label: 'Ungroup' });
    this.select(promoted);
  }

  /**
   * Applies a style patch to the selection at the active breakpoint.
   *
   * `mergeKey` collapses a drag gesture into a single undo step — without it,
   * nudging a slider would push one commit per pixel.
   */
  setStyle(style: StyleMap, options: { mergeKey?: string; label?: string } = {}): void {
    if (this.state.selection.length === 0) return;

    const breakpoint = this.state.activeBreakpoint;
    const ops = this.state.selection.map((nodeId): Operation => ({
      type: 'updateStyle',
      nodeId,
      style,
      ...(breakpoint === 'base' ? {} : { breakpoint }),
    }));

    this.store.transact(ops, {
      label: options.label ?? 'Update style',
      ...(options.mergeKey ? { mergeKey: options.mergeKey } : {}),
    });
  }

  setProps(props: Record<string, unknown>, label = 'Update content'): void {
    if (this.state.selection.length === 0) return;
    this.store.transact(
      this.state.selection.map((nodeId): Operation => ({ type: 'updateProps', nodeId, props })),
      { label },
    );
  }

  renameNode(nodeId: NodeId, name: string): void {
    this.store.transact([{ type: 'setNodeFields', nodeId, fields: { name } }], {
      label: 'Rename layer',
    });
  }

  toggleVisibility(nodeId: NodeId): void {
    const node = requireNode(this.getDocument(), nodeId);
    this.store.transact([{ type: 'setNodeFields', nodeId, fields: { hidden: !node.hidden } }], {
      label: node.hidden ? 'Show layer' : 'Hide layer',
    });
  }

  toggleLock(nodeId: NodeId): void {
    const node = requireNode(this.getDocument(), nodeId);
    this.store.transact([{ type: 'setNodeFields', nodeId, fields: { locked: !node.locked } }], {
      label: node.locked ? 'Unlock layer' : 'Lock layer',
    });
  }

  /** Reorders a node within its parent, used by the layers panel drag handle. */
  moveNode(nodeId: NodeId, parentId: NodeId, index: number): void {
    this.store.transact([{ type: 'moveNode', nodeId, parentId, index }], {
      label: 'Reorder layer',
    });
  }

  /* -------------------------------- assets ------------------------------ */

  /**
   * Supplies the ingestion pipeline.
   *
   * Injected rather than constructed here because the choice of storage adapter
   * belongs to the host: a local-first browser session inlines bytes, a hosted
   * deployment uploads them. The editor only needs to know that something can
   * turn a file into operations.
   */
  setIngestor(ingestor: AssetIngestor): void {
    this.ingestor = ingestor;
  }

  get hasIngestor(): boolean {
    return this.ingestor !== undefined;
  }

  private requireIngestor(): AssetIngestor {
    if (!this.ingestor) {
      throw new Error(
        '[opendesign] no asset ingestor configured — call editor.setIngestor() with a storage adapter',
      );
    }
    return this.ingestor;
  }

  /**
   * Adds a file to the project library.
   *
   * Deliberately does *not* place it on the canvas. Importing a batch of photos
   * and having twelve nodes appear stacked at the page root is not what anyone
   * means by "add to assets".
   */
  async addAssetFromFile(file: File | Blob, overrides?: Partial<IngestInput>): Promise<Asset> {
    const { asset, operations } = await this.requireIngestor().ingestFile(file, overrides);
    this.store.transact(operations, { label: `Add ${asset.name}` });
    return asset;
  }

  async addAssetFromUrl(url: string): Promise<Asset> {
    const { asset, operations } = await this.requireIngestor().ingestUrl(url);
    this.store.transact(operations, { label: `Import ${asset.name}` });
    return asset;
  }

  /** Drops an existing library asset onto the canvas as an image node. */
  placeAssetOnCanvas(assetId: string): NodeId | null {
    const document = this.getDocument();
    const asset = document.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new Error(`[opendesign] asset not found: ${assetId}`);

    const target = this.insertionTarget('primitive');
    if (!target) return null;

    const operations = placeAsset(asset, { parentId: target.parentId, index: target.index });
    this.store.transact(operations, { label: `Place ${asset.name}` });

    const inserted = operations[0];
    if (inserted && inserted.type === 'insertSubtree') {
      this.select(inserted.rootId);
      return inserted.rootId;
    }
    return null;
  }

  /**
   * Adds an asset and places it in one undo step.
   *
   * One commit rather than two, because "I dropped an image onto the canvas" is
   * a single action from the user's point of view and one ⌘Z should reverse it.
   */
  async dropFileOnCanvas(file: File | Blob, overrides?: Partial<IngestInput>): Promise<Asset> {
    const { asset, operations } = await this.requireIngestor().ingestFile(file, overrides);

    const target = this.insertionTarget('primitive');
    const placement = target
      ? placeAsset(asset, { parentId: target.parentId, index: target.index })
      : [];

    this.store.transact([...operations, ...placement], { label: `Add ${asset.name}` });

    const inserted = placement[0];
    if (inserted && inserted.type === 'insertSubtree') this.select(inserted.rootId);
    return asset;
  }

  /** Applies pre-built asset operations, e.g. from image generation. */
  addGeneratedAssets(operations: Operation[], label = 'Generate image'): void {
    if (operations.length === 0) return;
    this.store.transact(operations, { label, source: 'ai' });
  }

  /** Swaps the source of the selected image node to a library asset. */
  replaceImageSource(assetId: string): void {
    const document = this.getDocument();
    const asset = document.assets.find((candidate) => candidate.id === assetId);
    if (!asset) throw new Error(`[opendesign] asset not found: ${assetId}`);

    const targets = this.getSelectedNodes().filter((node) => node.type === 'image');
    if (targets.length === 0) return;

    this.store.transact(
      targets.map((node): Operation => ({
        type: 'updateProps',
        nodeId: node.id,
        props: { src: asset.url, alt: asset.alt ?? node.props.alt ?? asset.name },
      })),
      { label: `Replace image with ${asset.name}` },
    );
  }

  /* ---------------------- alignment & distribution ---------------------- */

  alignSelection(mode: AlignMode): void {
    const rects = this.selectionRects();
    if (rects.length < 2) return;

    const positions = alignRects(
      rects.map((entry) => entry.rect),
      mode,
    );

    this.store.transact(
      positions.map((position, index): Operation => ({
        type: 'updateStyle',
        nodeId: rects[index]!.id,
        style: { x: Math.round(position.x), y: Math.round(position.y) },
      })),
      { label: `Align ${mode}` },
    );
  }

  distributeSelection(axis: GuideAxis): void {
    const rects = this.selectionRects();
    if (rects.length < 3) return;

    const positions = distributeRects(
      rects.map((entry) => entry.rect),
      axis,
    );

    this.store.transact(
      positions.map((position, index): Operation => ({
        type: 'updateStyle',
        nodeId: rects[index]!.id,
        style: { x: Math.round(position.x), y: Math.round(position.y) },
      })),
      { label: `Distribute ${axis === 'x' ? 'horizontally' : 'vertically'}` },
    );
  }

  private selectionRects(): { id: NodeId; rect: Rect }[] {
    return this.state.selection
      .map((id) => {
        const rect = this.rects.get(id);
        return rect ? { id, rect } : null;
      })
      .filter((entry): entry is { id: NodeId; rect: Rect } => entry !== null);
  }

  /* ------------------------------- history ------------------------------ */

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  get canUndo(): boolean {
    return this.store.canUndo;
  }

  get canRedo(): boolean {
    return this.store.canRedo;
  }
}

/**
 * Deep-copies a subtree with fresh ids.
 *
 * The old->new id map is built first so cross-references inside the subtree
 * (children arrays, override keys) point at the copies rather than the originals.
 */
export function cloneSubtree(
  document: DesignDocument,
  rootId: NodeId,
): { nodes: SceneNode[]; rootId: NodeId } {
  const ids = collectSubtree(document, rootId);
  const idMap = new Map(ids.map((id) => [id, createId()]));

  const nodes = ids.map((id) => {
    const original = requireNode(document, id);
    return {
      ...structuredClone(original),
      id: idMap.get(id)!,
      parent: original.parent && idMap.has(original.parent) ? idMap.get(original.parent)! : null,
      children: original.children.map((childId) => idMap.get(childId)!).filter(Boolean),
      name: id === rootId ? `${original.name} copy` : original.name,
    } satisfies SceneNode;
  });

  return { nodes, rootId: idMap.get(rootId)! };
}
