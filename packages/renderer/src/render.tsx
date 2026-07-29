import {
  createElement,
  memo,
  type ComponentType,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  getNode,
  resolveStyle,
  type Breakpoint,
  type DesignDocument,
  type NodeId,
  type Page,
  type SceneNode,
} from '@opendesign/core';
import {
  nodeToClassName,
  styleToCssProperties,
  toReactStyle,
  tokensToCssVariables,
} from '@opendesign/design-system';
import { getPrimitive, resolveElement, VOID_ELEMENTS } from './primitives.js';
import { motionAttributes } from './motion.js';

/**
 * The renderer is deliberately dumb.
 *
 * It knows how to turn a document into DOM and nothing else — no selection, no
 * drag handles, no hover state, no editor store. Every rendered element carries
 * `data-od-id`, and the editor layers interaction on top through event
 * delegation and `getBoundingClientRect`.
 *
 * The same component renders the editor canvas, the published site and the SSR
 * preview. Two style modes exist because they have genuinely different needs:
 *
 *   - `classes` (default) emits Tailwind utilities — what published output and
 *     exported code use, and what keeps the canvas and the export in lockstep.
 *   - `inline` emits real CSS declarations. The editor canvas needs this: the
 *     class names come from the user's document at runtime, so Tailwind's
 *     compiler has never seen them and would emit no CSS for them. Both modes
 *     compile from the same `StyleMap` through `@opendesign/design-system`, so
 *     they agree on what a style *means* — they only disagree on how to spell it.
 */

export interface NodeComponentProps {
  node: SceneNode;
  document: DesignDocument;
  children: ReactNode;
}

export interface RenderOptions {
  /**
   * Custom React components keyed by node type. Plugin-contributed components
   * that need real runtime behaviour (a chart, a map) register here.
   */
  components?: Record<string, ComponentType<NodeComponentProps>>;
  /** Rendered when a node type has no primitive and no custom component. */
  fallback?: ComponentType<NodeComponentProps>;
  /** Skips `node.hidden` subtrees. The canvas keeps them, exports drop them. */
  omitHidden?: boolean;
  /** Emits `data-od-*` attributes. On for the canvas, off for published sites. */
  editorAttributes?: boolean;
  /**
   * `classes` emits Tailwind utilities; `inline` emits resolved CSS.
   * The canvas must use `inline` — see the note above.
   */
  styleMode?: 'classes' | 'inline';
  /** Breakpoint to resolve against in `inline` mode. */
  breakpoint?: Breakpoint;
}

export interface NodeRendererProps extends RenderOptions {
  document: DesignDocument;
  nodeId: NodeId;
}

function renderNode(
  document: DesignDocument,
  nodeId: NodeId,
  options: RenderOptions,
  depth = 0,
): ReactNode {
  const node = getNode(document, nodeId);
  if (!node) return null;
  if (options.omitHidden && node.hidden) return null;

  // Depth guard: a malformed import must degrade, never blow the stack.
  if (depth > 200) return null;

  const children = node.children.map((childId) =>
    renderNode(document, childId, options, depth + 1),
  );

  const custom = options.components?.[node.type];
  if (custom) {
    return createElement(
      custom,
      { key: node.id, node, document, children } as NodeComponentProps & { key: string },
    );
  }

  const spec = getPrimitive(node.type);
  if (!spec) {
    if (options.fallback) {
      return createElement(options.fallback, {
        key: node.id,
        node,
        document,
        children,
      } as NodeComponentProps & { key: string });
    }
    // Unknown types still render as a plain box so the layout survives.
    return createElement(
      'div',
      { key: node.id, 'data-od-id': node.id, 'data-od-unknown': node.type },
      children,
    );
  }

  const element = resolveElement(node);
  const inline = options.styleMode === 'inline';

  // In inline mode only the escape-hatch classes survive; everything the style
  // compiler would have produced becomes real CSS instead.
  const className = inline
    ? [spec.baseClassName, node.className].filter(Boolean).join(' ')
    : [spec.baseClassName, nodeToClassName(node)].filter(Boolean).join(' ');

  const motion = motionAttributes(node);

  const inlineStyle = inline
    ? {
        ...toReactStyle(styleToCssProperties(resolveStyle(node, options.breakpoint ?? 'base'))),
        ...(node.hidden ? { display: 'none' } : {}),
      }
    : undefined;

  const attributes: Record<string, unknown> = {
    key: node.id,
    ...(spec.attributes?.(node) ?? {}),
    ...(className ? { className } : {}),
    ...motion,
    ...(inlineStyle
      ? { style: { ...(motion.style as Record<string, string> | undefined), ...inlineStyle } }
      : {}),
  };

  if (options.editorAttributes !== false) {
    attributes['data-od-id'] = node.id;
    attributes['data-od-type'] = node.type;
    if (node.locked) attributes['data-od-locked'] = 'true';
  }

  if (typeof node.props.id === 'string') attributes.id = node.props.id;
  if (typeof node.props.ariaLabel === 'string') attributes['aria-label'] = node.props.ariaLabel;

  if (spec.selfClosing || VOID_ELEMENTS.has(element)) {
    return createElement(element, attributes);
  }

  if (spec.textContent) {
    const text = typeof node.props.text === 'string' ? node.props.text : '';
    // Text nodes may still nest inline children (a link inside a paragraph).
    return createElement(element, attributes, text, ...children);
  }

  return createElement(element, attributes, ...children);
}

export const NodeRenderer = memo(function NodeRenderer({
  document,
  nodeId,
  ...options
}: NodeRendererProps) {
  return renderNode(document, nodeId, options) as ReactElement | null;
});

export interface PageRendererProps extends RenderOptions {
  document: DesignDocument;
  pageId?: string;
  /** Applies the document's token variables to a wrapper element. */
  applyTokens?: boolean;
  className?: string;
}

/**
 * Renders one page, optionally scoping the whole design system to a wrapper so
 * several documents (or several themes) can coexist on the same screen — which
 * is exactly how the editor shows side-by-side responsive previews.
 */
export function PageRenderer({
  document,
  pageId,
  applyTokens = true,
  className,
  ...options
}: PageRendererProps) {
  const page: Page | undefined = pageId
    ? document.pages.find((p) => p.id === pageId)
    : document.pages[0];

  if (!page) return null;

  const content = renderNode(document, page.rootId, options);
  if (!applyTokens) return content as ReactElement | null;

  const theme = document.themes.find((t) => t.id === document.activeThemeId);
  const variables = tokensToCssVariables(document.tokens, theme);

  return createElement(
    'div',
    {
      'data-od-page': page.id,
      'data-theme': document.activeThemeId,
      className,
      style: variables as CSSProperties,
    },
    content,
  );
}

/** Renders every page of a document — used by static export previews. */
export function DocumentRenderer({ document, ...options }: PageRendererProps) {
  return createElement(
    'div',
    { 'data-od-document': document.id },
    ...document.pages.map((page) =>
      createElement(PageRenderer, { key: page.id, document, pageId: page.id, ...options }),
    ),
  );
}
