import type { SceneNode } from '@opendesign/core';

/**
 * How each primitive lands in the DOM.
 *
 * The renderer resolves a node type to an intrinsic element plus the props it
 * derives from `node.props`. Exporters consult the very same table, so a
 * `heading` is an `<h2>` on the canvas and an `<h2>` in the exported code.
 */
export interface PrimitiveSpec {
  /** Intrinsic element, or a function of the node for polymorphic primitives. */
  element: string | ((node: SceneNode) => string);
  /** Element attributes derived from node props. */
  attributes?: (node: SceneNode) => Record<string, unknown>;
  /** When true the element renders `props.text` instead of child nodes. */
  textContent?: boolean;
  /** Void elements must not receive children. */
  selfClosing?: boolean;
  /** Classes always applied, before the compiled style classes. */
  baseClassName?: string;
}

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

export const PRIMITIVES: Record<string, PrimitiveSpec> = {
  frame: { element: 'div' },
  stack: { element: 'div', baseClassName: 'flex' },
  grid: { element: 'div', baseClassName: 'grid' },

  text: {
    element: (node) => str(node.props.as, 'p'),
    textContent: true,
  },

  heading: {
    element: (node) => str(node.props.level, 'h2'),
    textContent: true,
  },

  link: {
    element: 'a',
    textContent: true,
    attributes: (node) => ({
      href: str(node.props.href, '#'),
      ...(node.props.external ? { target: '_blank', rel: 'noreferrer noopener' } : {}),
    }),
  },

  button: {
    element: (node) => (node.props.href ? 'a' : 'button'),
    textContent: true,
    attributes: (node) =>
      node.props.href
        ? { href: str(node.props.href) }
        : { type: str(node.props.buttonType, 'button') },
  },

  image: {
    element: 'img',
    selfClosing: true,
    attributes: (node) => ({
      src: str(node.props.src),
      alt: str(node.props.alt),
      ...(node.props.loading ? { loading: str(node.props.loading) } : { loading: 'lazy' }),
    }),
  },

  video: {
    element: 'video',
    attributes: (node) => ({
      src: str(node.props.src),
      controls: node.props.controls !== false,
      autoPlay: Boolean(node.props.autoPlay),
      muted: Boolean(node.props.muted),
      loop: Boolean(node.props.loop),
      playsInline: true,
    }),
  },

  input: {
    element: 'input',
    selfClosing: true,
    attributes: (node) => ({
      type: str(node.props.inputType, 'text'),
      placeholder: str(node.props.placeholder),
      name: str(node.props.name),
      ...(node.props.required ? { required: true } : {}),
    }),
  },

  textarea: {
    element: 'textarea',
    selfClosing: true,
    attributes: (node) => ({
      placeholder: str(node.props.placeholder),
      name: str(node.props.name),
      rows: typeof node.props.rows === 'number' ? node.props.rows : 4,
    }),
  },

  divider: { element: 'hr', selfClosing: true, baseClassName: 'border-0 border-t' },
  spacer: { element: 'div', selfClosing: true, baseClassName: 'shrink-0' },

  icon: {
    element: 'span',
    selfClosing: true,
    attributes: (node) => ({ 'data-icon': str(node.props.name, 'circle'), 'aria-hidden': true }),
    baseClassName: 'inline-flex items-center justify-center',
  },

  embed: {
    element: 'iframe',
    selfClosing: true,
    attributes: (node) => ({
      src: str(node.props.src),
      title: str(node.props.title, 'Embedded content'),
      loading: 'lazy',
    }),
  },

  /** A placeholder that renders its children; used inside reusable components. */
  slot: { element: 'div' },
};

export function getPrimitive(type: string): PrimitiveSpec | undefined {
  return PRIMITIVES[type];
}

export function resolveElement(node: SceneNode): string {
  const spec = PRIMITIVES[node.type];
  if (!spec) return 'div';
  return typeof spec.element === 'function' ? spec.element(node) : spec.element;
}

/** Elements that must never receive children, in HTML terms. */
export const VOID_ELEMENTS = new Set([
  'img',
  'input',
  'hr',
  'br',
  'source',
  'track',
  'meta',
  'link',
]);
