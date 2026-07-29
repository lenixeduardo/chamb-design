import { getNode, type DesignDocument, type NodeId, type SceneNode } from '@opendesign/core';
import { nodeToClassName } from '@opendesign/design-system';
import { getPrimitive, resolveElement, VOID_ELEMENTS } from '@opendesign/renderer';

/**
 * A framework-neutral markup tree.
 *
 * Every exporter builds this once and then only decides how to *spell* it:
 * `className` vs `class`, `{expr}` vs `{{ expr }}`, self-closing or not.
 * Sharing the tree is what keeps six export targets consistent with each other
 * and with the canvas — the class names come from the same compiler the
 * renderer uses.
 */
export interface EmitElement {
  tag: string;
  /** Attribute names are HTML-flavoured; serializers rename per framework. */
  attributes: Record<string, string | number | boolean>;
  className: string;
  text?: string;
  children: EmitElement[];
  selfClosing: boolean;
  /** Source node id, kept for source maps and round-trip debugging. */
  nodeId: NodeId;
  /**
   * Set when this position was cut into its own component. Serializers emit a
   * `<Hero />` reference instead of the subtree.
   */
  componentRef?: string;
}

export interface BuildOptions {
  /** Drop nodes flagged hidden. Exports do; the canvas does not. */
  omitHidden?: boolean;
  /** Stop descending at these ids and emit a component reference instead. */
  boundaries?: Map<NodeId, string>;
}

export interface SectionRef {
  nodeId: NodeId;
  componentName: string;
  element: EmitElement;
}

export function buildElementTree(
  document: DesignDocument,
  nodeId: NodeId,
  options: BuildOptions = {},
): EmitElement | null {
  const node = getNode(document, nodeId);
  if (!node) return null;
  if (options.omitHidden !== false && node.hidden) return null;

  const spec = getPrimitive(node.type);
  const tag = spec ? resolveElement(node) : 'div';
  const baseClass = spec?.baseClassName ?? '';
  const className = [baseClass, nodeToClassName(node)].filter(Boolean).join(' ');

  const attributes = normalizeAttributes(spec?.attributes?.(node) ?? {});
  if (typeof node.props.id === 'string') attributes.id = node.props.id;
  if (typeof node.props.ariaLabel === 'string') attributes['aria-label'] = node.props.ariaLabel;

  const selfClosing = Boolean(spec?.selfClosing) || VOID_ELEMENTS.has(tag);

  const element: EmitElement = {
    tag,
    attributes,
    className,
    children: [],
    selfClosing,
    nodeId: node.id,
  };

  if (spec?.textContent && typeof node.props.text === 'string') {
    element.text = node.props.text;
  }

  if (!selfClosing) {
    for (const childId of node.children) {
      const boundary = options.boundaries?.get(childId);
      if (boundary) {
        element.children.push({
          tag: boundary,
          attributes: {},
          className: '',
          children: [],
          selfClosing: true,
          nodeId: childId,
          componentRef: boundary,
        });
        continue;
      }

      const child = buildElementTree(document, childId, options);
      if (child) element.children.push(child);
    }
  }

  return element;
}

function normalizeAttributes(
  input: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Splits a page into a shell plus one component per top-level section.
 *
 * A 900-line page component is technically correct and practically useless.
 * Real projects have `<Hero />`, `<Pricing />`, `<Footer />` — so that is what
 * we emit, using each frame's layer name as the component name.
 */
export function splitSections(
  document: DesignDocument,
  rootId: NodeId,
  options: BuildOptions = {},
): { shell: EmitElement | null; sections: SectionRef[] } {
  const root = getNode(document, rootId);
  if (!root) return { shell: null, sections: [] };

  const sections: SectionRef[] = [];
  const used = new Set<string>();

  for (const childId of root.children) {
    const child = getNode(document, childId);
    if (!child || (options.omitHidden !== false && child.hidden)) continue;
    // Only structural containers become their own component.
    if (child.children.length === 0) continue;

    const componentName = uniqueName(toPascalCase(child.name || child.type), used);
    const element = buildElementTree(document, childId, options);
    if (element) sections.push({ nodeId: childId, componentName, element });
  }

  const boundaries = new Map(sections.map((s) => [s.nodeId, s.componentName]));
  const shell = buildElementTree(document, rootId, { ...options, boundaries });

  return { shell, sections };
}

export function toPascalCase(input: string): string {
  const cleaned = input
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/[\s_-]+/g, ' ')
    .trim();

  const pascal = cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  // Component names cannot start with a digit.
  return /^[0-9]/.test(pascal) ? `Section${pascal}` : pascal || 'Section';
}

export function toKebabCase(input: string): string {
  return (
    input
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'page'
  );
}

function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let index = 2;
  while (used.has(`${name}${index}`)) index += 1;
  const unique = `${name}${index}`;
  used.add(unique);
  return unique;
}

/** Route path for a page, e.g. `/pricing` -> `pricing`. */
export function pageRouteSegment(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed.length === 0 ? '' : trimmed;
}
