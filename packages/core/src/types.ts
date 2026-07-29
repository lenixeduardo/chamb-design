/**
 * The OpenDesign document model.
 *
 * Everything the editor, the renderer, the AI layer and the exporters agree on
 * lives here. The model is intentionally:
 *
 *  - **Flat**: nodes live in a `Record<NodeId, SceneNode>` so any lookup is O(1)
 *    and any mutation touches a bounded number of objects. This is what makes
 *    undo/redo, streaming AI patches and (later) CRDT sync cheap.
 *  - **Serializable**: no class instances, no functions, no cycles. A document
 *    round-trips through `JSON.stringify` losslessly.
 *  - **Token-first**: colors, spacing, radii and typography are expressed as
 *    token references (`"{color.primary.500}"`) whenever possible, so retheming
 *    a whole project is a single token edit.
 */

export type NodeId = string;
export type PageId = string;
export type AssetId = string;

/** A reference into the design system, e.g. `{color.primary.500}`. */
export type TokenRef = `{${string}}`;

export function isTokenRef(value: unknown): value is TokenRef {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

/** Named viewports. Styles cascade mobile-first: `base` -> `sm` -> ... -> `2xl`. */
export const BREAKPOINTS = ['base', 'sm', 'md', 'lg', 'xl', '2xl'] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

/** Editor viewport presets surfaced in the responsive toolbar. */
export const DEVICE_PRESETS = [
  { id: 'mobile', label: 'Mobile', width: 390, height: 844, breakpoint: 'base' },
  { id: 'tablet', label: 'Tablet', width: 834, height: 1112, breakpoint: 'md' },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900, breakpoint: 'xl' },
] as const satisfies readonly DevicePreset[];

export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  breakpoint: Breakpoint;
}

/* -------------------------------------------------------------------------- */
/*                                   Style                                    */
/* -------------------------------------------------------------------------- */

/** A length: a number (px), a raw CSS string, or a spacing token. */
export type Length = number | string | TokenRef;

export interface BoxValue {
  top?: Length;
  right?: Length;
  bottom?: Length;
  left?: Length;
}

export type SizeValue = Length | 'auto' | 'fill' | 'hug';

export interface BorderValue {
  width?: Length;
  style?: 'solid' | 'dashed' | 'dotted' | 'none';
  color?: TokenRef | string;
}

export interface FontValue {
  family?: TokenRef | string;
  size?: Length;
  weight?: number;
  lineHeight?: Length;
  letterSpacing?: Length;
  align?: 'left' | 'center' | 'right' | 'justify';
  transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  italic?: boolean;
  decoration?: 'none' | 'underline' | 'line-through';
}

/**
 * The style surface an OpenDesign node can express.
 *
 * It is deliberately a *subset* of CSS: a curated set of properties that map
 * cleanly onto Tailwind utilities, onto Figma-style visual controls, and onto
 * every export target. Anything outside this set goes through `className` or
 * `css`, which exporters pass through untouched.
 */
export interface StyleMap {
  display?: 'flex' | 'inline-flex' | 'grid' | 'block' | 'inline-block' | 'none';
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: boolean;
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  gap?: Length;

  gridColumns?: number | string;
  gridRows?: number | string;
  colSpan?: number;
  rowSpan?: number;

  padding?: BoxValue;
  margin?: BoxValue;

  width?: SizeValue;
  height?: SizeValue;
  minWidth?: Length;
  minHeight?: Length;
  maxWidth?: Length;
  maxHeight?: Length;

  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  inset?: BoxValue;
  zIndex?: number;

  /** Free-form canvas placement, used when a node is absolutely positioned. */
  x?: number;
  y?: number;

  background?: TokenRef | string;
  color?: TokenRef | string;
  border?: BorderValue;
  radius?: Length | BoxValue;
  shadow?: TokenRef | string;
  opacity?: number;
  backdropBlur?: Length;
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll';
  cursor?: string;
  aspectRatio?: string;

  font?: FontValue;

  transition?: string;
  transform?: string;
}

/** Constraints describe how a node reacts when its parent frame resizes. */
export interface Constraints {
  horizontal: 'left' | 'right' | 'center' | 'scale' | 'stretch';
  vertical: 'top' | 'bottom' | 'center' | 'scale' | 'stretch';
}

/* -------------------------------------------------------------------------- */
/*                                   Motion                                   */
/* -------------------------------------------------------------------------- */

export interface MotionKeyframe {
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  blur?: number;
}

export interface MotionSpec {
  /** Which engine the exporter should target. */
  engine: 'framer-motion' | 'gsap' | 'css';
  trigger: 'mount' | 'hover' | 'tap' | 'in-view' | 'scroll';
  from?: MotionKeyframe;
  to?: MotionKeyframe;
  duration?: number;
  delay?: number;
  /** Per-child delay for staggered entrances. */
  stagger?: number;
  ease?: string;
  repeat?: number;
}

/* -------------------------------------------------------------------------- */
/*                                    Node                                    */
/* -------------------------------------------------------------------------- */

/**
 * Built-in primitives every renderer and exporter must understand.
 * Anything else is either a library block or a plugin-contributed type, and is
 * resolved through the component registry.
 */
export const PRIMITIVE_TYPES = [
  'frame',
  'stack',
  'grid',
  'text',
  'heading',
  'image',
  'icon',
  'button',
  'input',
  'textarea',
  'link',
  'divider',
  'spacer',
  'video',
  'embed',
  'slot',
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

export interface SceneNode {
  id: NodeId;
  /** A primitive, a registry component id (`lib:pricing-table`) or `instance`. */
  type: PrimitiveType | (string & {});
  name: string;
  parent: NodeId | null;
  children: NodeId[];

  /** Component props (text content, image src, variant, ...). */
  props: Record<string, unknown>;

  /** Base style, applied at every breakpoint. */
  style: StyleMap;

  /** Per-breakpoint overrides merged on top of `style`, mobile-first. */
  responsive?: Partial<Record<Exclude<Breakpoint, 'base'>, StyleMap>>;

  /** Escape hatch: raw utility classes appended after generated ones. */
  className?: string;

  constraints?: Constraints;
  motion?: MotionSpec;

  locked?: boolean;
  hidden?: boolean;

  /** Set when this node is an instance of a document component. */
  componentId?: string;
  /** Prop overrides applied on top of the component definition. */
  overrides?: Record<NodeId, Partial<Pick<SceneNode, 'props' | 'style' | 'className'>>>;

  /** Free-form metadata; plugins namespace their keys (`charts:series`). */
  meta?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

export interface Page {
  id: PageId;
  name: string;
  /** Route used when the project is exported or published. */
  path: string;
  rootId: NodeId;
  canvas: {
    width: number;
    height: number;
    background?: TokenRef | string;
  };
  meta?: {
    title?: string;
    description?: string;
    ogImage?: string;
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Assets                                   */
/* -------------------------------------------------------------------------- */

export type AssetKind = 'image' | 'svg' | 'video' | 'icon' | 'logo' | 'font';

export interface Asset {
  id: AssetId;
  kind: AssetKind;
  name: string;
  /**
   * Where the bytes live. A `data:` URI for local-first projects, an http(s)
   * URL once a storage adapter is configured. Keeping this a plain string is
   * what lets a project move between the two without touching any node.
   */
  url: string;
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
  /** Alt text. The AI review pass flags images that are missing it. */
  alt?: string;
  /**
   * Set on generated assets. Keeping the prompt means "make it wider" or
   * "same thing but at night" can re-run generation instead of starting over.
   */
  prompt?: string;
  /** Provider id that generated this asset, e.g. `openai-images`. */
  generatedBy?: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                              Design components                             */
/* -------------------------------------------------------------------------- */

export interface ComponentPropDef {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'color' | 'image' | 'enum';
  defaultValue?: unknown;
  options?: string[];
  /** Node + prop this definition is bound to inside the component subtree. */
  binding?: { nodeId: NodeId; prop: string };
}

/** A user-defined reusable component, i.e. a named detached subtree. */
export interface ComponentDef {
  id: string;
  name: string;
  description?: string;
  rootId: NodeId;
  props: ComponentPropDef[];
  category?: string;
}

/* -------------------------------------------------------------------------- */
/*                                   Tokens                                   */
/* -------------------------------------------------------------------------- */

export interface TokenGroup {
  [key: string]: string | number | TokenGroup;
}

export interface ThemeDef {
  id: string;
  name: string;
  appearance: 'light' | 'dark';
  /** Token overrides applied on top of the base token set. */
  tokens: TokenGroup;
}

export interface TokenSet {
  color: TokenGroup;
  spacing: TokenGroup;
  radius: TokenGroup;
  shadow: TokenGroup;
  font: TokenGroup;
  size: TokenGroup;
  breakpoint: Record<Breakpoint, number>;
  [namespace: string]: TokenGroup | Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/*                                  Document                                  */
/* -------------------------------------------------------------------------- */

export const DOCUMENT_SCHEMA_VERSION = 1;

export interface DesignDocument {
  /** Bump only on breaking model changes; migrations live in `migrate.ts`. */
  schemaVersion: number;
  id: string;
  name: string;
  pages: Page[];
  nodes: Record<NodeId, SceneNode>;
  tokens: TokenSet;
  themes: ThemeDef[];
  activeThemeId: string;
  assets: Asset[];
  components: ComponentDef[];
  createdAt: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}
