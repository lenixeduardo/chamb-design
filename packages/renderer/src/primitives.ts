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

/**
 * A prop that becomes a tag name is not free text.
 *
 * `props` is `z.record(z.unknown())` in the schema, so a document that arrived
 * from an import, a plugin or a model can put anything in `props.as`. It ends up
 * interpolated straight into `<…>` by the exporters, which is how
 * `as: 'div onmouseover="…"'` or `level: 'script'` becomes executable code in
 * every generated project. Anything not on the list falls back.
 */
const oneOf = (value: unknown, allowed: ReadonlySet<string>, fallback: string): string =>
  typeof value === 'string' && allowed.has(value) ? value : fallback;

const TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  'p',
  'span',
  'div',
  'strong',
  'em',
  'b',
  'i',
  'small',
  'label',
  'blockquote',
  'figcaption',
  'caption',
  'li',
  'dt',
  'dd',
  'code',
  'pre',
  'address',
  'time',
]);

const HEADING_ELEMENTS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const BUTTON_TYPES: ReadonlySet<string> = new Set(['button', 'submit', 'reset']);

const INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'email',
  'password',
  'search',
  'tel',
  'url',
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'color',
  'checkbox',
  'radio',
  'file',
  'range',
  'hidden',
]);

const LOADING_VALUES: ReadonlySet<string> = new Set(['lazy', 'eager']);

export const PRIMITIVES: Record<string, PrimitiveSpec> = {
  frame: { element: 'div' },
  stack: { element: 'div', baseClassName: 'flex' },
  grid: { element: 'div', baseClassName: 'grid' },

  text: {
    element: (node) => oneOf(node.props.as, TEXT_ELEMENTS, 'p'),
    textContent: true,
  },

  heading: {
    element: (node) => oneOf(node.props.level, HEADING_ELEMENTS, 'h2'),
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
        : { type: oneOf(node.props.buttonType, BUTTON_TYPES, 'button') },
  },

  image: {
    element: 'img',
    selfClosing: true,
    attributes: (node) => ({
      src: str(node.props.src),
      alt: str(node.props.alt),
      loading: oneOf(node.props.loading, LOADING_VALUES, 'lazy'),
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
      type: oneOf(node.props.inputType, INPUT_TYPES, 'text'),
      placeholder: str(node.props.placeholder),
      name: str(node.props.name),
      ...(node.props.required ? { required: true } : {}),
    }),
  },

  // Not self-closing: `<textarea>` is a raw-text element, and leaving it
  // unclosed swallows the rest of the page into its value.
  textarea: {
    element: 'textarea',
    attributes: (node) => ({
      placeholder: str(node.props.placeholder),
      name: str(node.props.name),
      rows: typeof node.props.rows === 'number' ? node.props.rows : 4,
    }),
  },

  divider: { element: 'hr', selfClosing: true, baseClassName: 'border-0 border-t' },
  spacer: { element: 'div', baseClassName: 'shrink-0' },

  icon: {
    element: 'span',
    attributes: (node) => ({ 'data-icon': str(node.props.name, 'circle'), 'aria-hidden': true }),
    baseClassName: 'inline-flex items-center justify-center',
  },

  embed: {
    element: 'iframe',
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

/**
 * Elements that must never receive children, in HTML terms.
 *
 * This is the authority on whether a tag may be written unclosed. A primitive
 * that renders no children is *not* the same thing as a void element —
 * `<span>`, `<textarea>` and `<iframe>` all still need a closing tag, and
 * conflating the two produced HTML exports where everything after a `<textarea>`
 * was swallowed into it.
 */
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
