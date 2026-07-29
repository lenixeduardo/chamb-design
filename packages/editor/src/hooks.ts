import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { DesignDocument, NodeId, SceneNode } from '@opendesign/core';
import type { Editor, EditorState } from './editor.js';

/**
 * React bindings.
 *
 * `useSyncExternalStore` rather than a context + reducer: the editor is a
 * long-lived mutable object driven by pointer events at 60fps, and forcing it
 * through React state would mean re-rendering the whole tree on every mouse
 * move. This way components subscribe to exactly the slice they read.
 */

export function useEditorState(editor: Editor): EditorState {
  return useSyncExternalStore(
    useCallback((onChange) => editor.subscribe(onChange), [editor]),
    useCallback(() => editor.getState(), [editor]),
    useCallback(() => editor.getState(), [editor]),
  );
}

export function useDocument(editor: Editor): DesignDocument {
  return useSyncExternalStore(
    useCallback((onChange) => editor.subscribe(onChange), [editor]),
    useCallback(() => editor.getDocument(), [editor]),
    useCallback(() => editor.getDocument(), [editor]),
  );
}

/**
 * Subscribes to a derived slice.
 *
 * `isEqual` prevents a re-render when the selector's output is structurally
 * unchanged — without it, any array-returning selector would fire every tick.
 */
export function useEditorSelector<T>(
  editor: Editor,
  selector: (state: EditorState, document: DesignDocument) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const cache = useRef<{ value: T; hasValue: boolean }>({ value: undefined as T, hasValue: false });

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(editor.getState(), editor.getDocument());
    if (cache.current.hasValue && isEqual(cache.current.value, next)) {
      return cache.current.value;
    }
    cache.current = { value: next, hasValue: true };
    return next;
  }, [editor, isEqual]);

  return useSyncExternalStore(
    useCallback((onChange) => editor.subscribe(onChange), [editor]),
    getSnapshot,
    getSnapshot,
  );
}

function shallowArrayEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function useSelection(editor: Editor): NodeId[] {
  return useEditorSelector(editor, (state) => state.selection, shallowArrayEqual);
}

export function useSelectedNodes(editor: Editor): SceneNode[] {
  return useEditorSelector(
    editor,
    (state, document) =>
      state.selection
        .map((id) => document.nodes[id])
        .filter((node): node is SceneNode => Boolean(node)),
    shallowArrayEqual,
  );
}

export function useNode(editor: Editor, nodeId: NodeId | null): SceneNode | undefined {
  return useEditorSelector(editor, (_state, document) =>
    nodeId ? document.nodes[nodeId] : undefined,
  );
}

export function useActivePage(editor: Editor) {
  return useEditorSelector(editor, (state, document) =>
    document.pages.find((page) => page.id === state.activePageId),
  );
}

export function useHistoryState(editor: Editor): { canUndo: boolean; canRedo: boolean } {
  return useEditorSelector(
    editor,
    () => ({ canUndo: editor.canUndo, canRedo: editor.canRedo }),
    (a, b) => a.canUndo === b.canUndo && a.canRedo === b.canRedo,
  );
}

/**
 * Measures every rendered node and feeds the geometry back to the editor.
 *
 * Snapping and alignment need real on-screen boxes, and only the DOM knows
 * them once auto-layout has run. A ResizeObserver on the container catches
 * reflows without polling.
 */
export function useCanvasMeasurement(
  editor: Editor,
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  const document = useDocument(editor);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const rects = new Map<NodeId, { x: number; y: number; width: number; height: number }>();

      for (const element of container.querySelectorAll<HTMLElement>('[data-od-id]')) {
        const id = element.dataset.odId;
        if (!id) continue;
        const rect = element.getBoundingClientRect();
        rects.set(id, {
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
        });
      }

      editor.setMeasuredRects(rects);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const element of container.querySelectorAll('[data-od-id]')) observer.observe(element);

    return () => observer.disconnect();
  }, [editor, containerRef, document]);
}

/** Wires canvas pointer events to selection, using delegation on `data-od-id`. */
export function useCanvasSelection(
  editor: Editor,
  containerRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const findNodeId = (target: EventTarget | null): NodeId | null => {
      if (!(target instanceof Element)) return null;
      const element = target.closest<HTMLElement>('[data-od-id]:not([data-od-locked="true"])');
      return element?.dataset.odId ?? null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (editor.getState().tool !== 'select') return;
      const nodeId = findNodeId(event.target);

      if (!nodeId) {
        editor.clearSelection();
        return;
      }

      if (event.shiftKey) editor.toggleSelection(nodeId);
      else editor.select(nodeId);
    };

    const onPointerMove = (event: PointerEvent) => {
      editor.setHovered(findNodeId(event.target));
    };

    const onPointerLeave = () => editor.setHovered(null);

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [editor, containerRef]);
}

/** Flattened layer list for the layers panel, with depth for indentation. */
export function useLayerTree(editor: Editor, rootId: NodeId | undefined) {
  const document = useDocument(editor);

  return useMemo(() => {
    if (!rootId) return [];
    const rows: { node: SceneNode; depth: number }[] = [];

    const visit = (id: NodeId, depth: number) => {
      const node = document.nodes[id];
      if (!node) return;
      rows.push({ node, depth });
      for (const childId of node.children) visit(childId, depth + 1);
    };

    visit(rootId, 0);
    return rows;
  }, [document, rootId]);
}
