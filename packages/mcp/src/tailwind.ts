import type { Breakpoint, Length, StyleMap } from '@opendesign/core';

/**
 * Tailwind classes in, `StyleMap` out.
 *
 * 21st.dev returns React with Tailwind, and this project's document model
 * stores style as structured values with token references. Translating means
 * a generated hero arrives as *real nodes* — selectable, restylable, undoable,
 * exportable to Vue or Svelte — instead of a blob of JSX nobody can edit in
 * the canvas.
 *
 * Two rules keep it honest:
 *
 *  - Anything with a token equivalent becomes the token, not the literal.
 *    `bg-primary` is `{color.accent}`, so the generated section rethemes with
 *    the rest of the project instead of staying indigo forever.
 *  - Anything unrecognised is passed through as a class rather than dropped.
 *    The renderer appends `className` after generated utilities, so an exotic
 *    gradient still renders — it simply is not editable in the inspector.
 */

export type ResponsiveStyles = Partial<Record<Exclude<Breakpoint, 'base'>, StyleMap>>;

export interface TranslatedClasses {
  style: StyleMap;
  responsive: ResponsiveStyles;
  /** Classes with no structured equivalent, kept verbatim for `className`. */
  passthrough: string[];
}

const BREAKPOINT_VARIANTS = new Set<Exclude<Breakpoint, 'base'>>(['sm', 'md', 'lg', 'xl', '2xl']);

/** Spacing steps that exist in the token set; anything else becomes pixels. */
const SPACING_STEPS = new Set([0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32]);

const FONT_SIZES = new Set([
  'xs',
  'sm',
  'base',
  'lg',
  'xl',
  '2xl',
  '3xl',
  '4xl',
  '5xl',
  '6xl',
  '7xl',
]);

const FONT_WEIGHTS: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

const RADII: Record<string, string> = {
  none: '{radius.none}',
  sm: '{radius.sm}',
  DEFAULT: '{radius.sm}',
  md: '{radius.md}',
  lg: '{radius.lg}',
  xl: '{radius.xl}',
  '2xl': '{radius.2xl}',
  '3xl': '{radius.2xl}',
  full: '{radius.full}',
};

const SHADOWS: Record<string, string> = {
  none: 'none',
  sm: '{shadow.sm}',
  DEFAULT: '{shadow.sm}',
  md: '{shadow.md}',
  lg: '{shadow.lg}',
  xl: '{shadow.xl}',
  '2xl': '{shadow.xl}',
};

const MAX_WIDTHS: Record<string, string> = {
  xs: '320px',
  sm: '384px',
  md: '448px',
  lg: '512px',
  xl: '576px',
  '2xl': '672px',
  '3xl': '768px',
  '4xl': '896px',
  '5xl': '1024px',
  '6xl': '1152px',
  '7xl': '1280px',
  full: '100%',
  none: 'none',
  prose: '65ch',
  screen: '100vw',
};

const LINE_HEIGHTS: Record<string, string> = {
  none: '1',
  tight: '1.15',
  snug: '1.3',
  normal: '1.5',
  relaxed: '1.65',
  loose: '2',
};

const LETTER_SPACING: Record<string, string> = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
};

/**
 * shadcn/Tailwind colour names mapped onto this design system's tokens.
 *
 * The mapping is opinionated where the two vocabularies disagree: shadcn's
 * `primary` is the brand action colour, which is `accent` here, and its
 * `secondary` is a low-contrast surface, which is `muted`.
 */
const SEMANTIC_COLORS: Record<string, string> = {
  background: '{color.background}',
  foreground: '{color.foreground}',
  muted: '{color.muted}',
  'muted-foreground': '{color.muted-foreground}',
  card: '{color.card}',
  'card-foreground': '{color.foreground}',
  popover: '{color.card}',
  'popover-foreground': '{color.foreground}',
  border: '{color.border}',
  input: '{color.border}',
  ring: '{color.ring}',
  primary: '{color.accent}',
  'primary-foreground': '{color.accent-foreground}',
  secondary: '{color.muted}',
  'secondary-foreground': '{color.foreground}',
  accent: '{color.accent}',
  'accent-foreground': '{color.accent-foreground}',
  destructive: '{color.danger.500}',
  'destructive-foreground': '{color.accent-foreground}',
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  current: 'currentColor',
};

const NEUTRAL_FAMILIES = new Set(['neutral', 'zinc', 'gray', 'grey', 'slate', 'stone']);
const PRIMARY_FAMILIES = new Set(['indigo', 'violet', 'blue', 'purple']);
const NEUTRAL_SCALE = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
]);
const PRIMARY_SCALE = new Set([
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
]);

export function translateClasses(input: string): TranslatedClasses {
  const style: StyleMap = {};
  const responsive: ResponsiveStyles = {};
  const passthrough: string[] = [];

  for (const token of input.split(/\s+/).filter(Boolean)) {
    const segments = token.split(':');
    const utility = segments.pop()!;
    const variants = segments;

    const mapped = mapUtility(utility);
    if (!mapped) {
      passthrough.push(token);
      continue;
    }

    if (variants.length === 0) {
      mergeStyle(style, mapped);
      continue;
    }

    // Only a bare breakpoint variant has a home in the model. `hover:` and
    // `dark:` are real styles the renderer can still apply as classes, so they
    // stay classes rather than being flattened into the base — which would be
    // worse than useless: a hover colour applied at rest.
    const [variant, ...rest] = variants;
    if (rest.length === 0 && BREAKPOINT_VARIANTS.has(variant as Exclude<Breakpoint, 'base'>)) {
      const key = variant as Exclude<Breakpoint, 'base'>;
      responsive[key] ??= {};
      mergeStyle(responsive[key]!, mapped);
      continue;
    }

    passthrough.push(token);
  }

  return { style, responsive, passthrough };
}

/* -------------------------------------------------------------------------- */
/*                              Utility mapping                               */
/* -------------------------------------------------------------------------- */

function mapUtility(utility: string): StyleMap | null {
  const negative = utility.startsWith('-');
  const cls = negative ? utility.slice(1) : utility;

  switch (cls) {
    case 'flex':
      return { display: 'flex' };
    case 'inline-flex':
      return { display: 'inline-flex' };
    case 'grid':
      return { display: 'grid' };
    case 'block':
      return { display: 'block' };
    case 'inline-block':
      return { display: 'inline-block' };
    case 'hidden':
      return { display: 'none' };
    case 'flex-col':
      return { display: 'flex', direction: 'column' };
    case 'flex-col-reverse':
      return { display: 'flex', direction: 'column-reverse' };
    case 'flex-row':
      return { display: 'flex', direction: 'row' };
    case 'flex-row-reverse':
      return { display: 'flex', direction: 'row-reverse' };
    case 'flex-wrap':
      return { wrap: true };
    case 'flex-nowrap':
      return { wrap: false };
    case 'relative':
      return { position: 'relative' };
    case 'absolute':
      return { position: 'absolute' };
    case 'fixed':
      return { position: 'fixed' };
    case 'sticky':
      return { position: 'sticky' };
    case 'static':
      return { position: 'static' };
    case 'inset-0':
      return { inset: { top: 0, right: 0, bottom: 0, left: 0 } };
    case 'italic':
      return { font: { italic: true } };
    case 'not-italic':
      return { font: { italic: false } };
    case 'uppercase':
      return { font: { transform: 'uppercase' } };
    case 'lowercase':
      return { font: { transform: 'lowercase' } };
    case 'capitalize':
      return { font: { transform: 'capitalize' } };
    case 'underline':
      return { font: { decoration: 'underline' } };
    case 'line-through':
      return { font: { decoration: 'line-through' } };
    case 'border':
      return { border: { width: 1, style: 'solid', color: '{color.border}' } };
    case 'border-0':
      return { border: { width: 0, style: 'none' } };
    case 'shadow':
      return { shadow: SHADOWS.DEFAULT! };
    case 'rounded':
      return { radius: RADII.DEFAULT! };
    case 'transition':
    case 'transition-all':
    case 'transition-colors':
      return { transition: 'all 200ms ease' };
    case 'aspect-video':
      return { aspectRatio: '16 / 9' };
    case 'aspect-square':
      return { aspectRatio: '1 / 1' };
    case 'cursor-pointer':
      return { cursor: 'pointer' };
    case 'overflow-hidden':
      return { overflow: 'hidden' };
    case 'overflow-auto':
      return { overflow: 'auto' };
    case 'container':
      // Not Tailwind's exact behaviour (which is a set of breakpoint maxima),
      // but it is what the class is used for: a centred content column.
      return { width: 'fill', maxWidth: '1200px', margin: { left: 'auto', right: 'auto' } };
    case 'mx-auto':
      return { margin: { left: 'auto', right: 'auto' } };
    case 'w-full':
      return { width: 'fill' };
    case 'w-fit':
      return { width: 'hug' };
    case 'w-auto':
      return { width: 'auto' };
    case 'w-screen':
      return { width: '100vw' };
    case 'h-full':
      return { height: 'fill' };
    case 'h-fit':
      return { height: 'hug' };
    case 'h-auto':
      return { height: 'auto' };
    case 'h-screen':
      return { height: '100vh' };
    case 'min-h-screen':
      return { minHeight: '100vh' };
    case 'text-left':
      return { font: { align: 'left' } };
    case 'text-center':
      return { font: { align: 'center' } };
    case 'text-right':
      return { font: { align: 'right' } };
    case 'text-justify':
      return { font: { align: 'justify' } };
    default:
      break;
  }

  const [prefix, ...rest] = splitUtility(cls);
  const value = rest.join('-');

  switch (prefix) {
    case 'items':
      return mapAlign(value) ? { align: mapAlign(value)! } : null;
    case 'justify':
      return mapJustify(value) ? { justify: mapJustify(value)! } : null;
    case 'gap':
      return withLength(value, (length) => ({ gap: length }));
    case 'space':
      // `space-y-6` is a margin trick for a gapless flow; the model expresses
      // the same intent as a gap, and that is what the section actually wants.
      return withLength(value.replace(/^[xy]-/, ''), (length) => ({ gap: length }));
    case 'p':
      return withLength(value, (length) => ({ padding: box(length, 'all') }));
    case 'px':
      return withLength(value, (length) => ({ padding: box(length, 'x') }));
    case 'py':
      return withLength(value, (length) => ({ padding: box(length, 'y') }));
    case 'pt':
      return withLength(value, (length) => ({ padding: { top: length } }));
    case 'pr':
      return withLength(value, (length) => ({ padding: { right: length } }));
    case 'pb':
      return withLength(value, (length) => ({ padding: { bottom: length } }));
    case 'pl':
      return withLength(value, (length) => ({ padding: { left: length } }));
    case 'm':
      return withLength(value, (length) => ({ margin: box(signed(length, negative), 'all') }));
    case 'mx':
      return withLength(value, (length) => ({ margin: box(signed(length, negative), 'x') }));
    case 'my':
      return withLength(value, (length) => ({ margin: box(signed(length, negative), 'y') }));
    case 'mt':
      return withLength(value, (length) => ({ margin: { top: signed(length, negative) } }));
    case 'mb':
      return withLength(value, (length) => ({ margin: { bottom: signed(length, negative) } }));
    case 'ml':
      return withLength(value, (length) => ({ margin: { left: signed(length, negative) } }));
    case 'mr':
      return withLength(value, (length) => ({ margin: { right: signed(length, negative) } }));
    case 'w':
      return withLength(value, (length) => ({ width: length }));
    case 'h':
      return withLength(value, (length) => ({ height: length }));
    case 'min':
      return mapMinMax('min', value);
    case 'max':
      return mapMinMax('max', value);
    case 'grid':
      if (value.startsWith('cols-')) {
        const columns = value.slice(5);
        const parsed = Number(columns);
        return Number.isFinite(parsed)
          ? { gridColumns: parsed }
          : { gridColumns: arbitrary(columns) ?? columns };
      }
      return null;
    case 'col':
      if (value.startsWith('span-')) {
        const span = Number(value.slice(5));
        return Number.isFinite(span) ? { colSpan: span } : null;
      }
      return null;
    case 'rounded':
      return mapRadius(value);
    case 'shadow':
      return SHADOWS[value] ? { shadow: SHADOWS[value]! } : null;
    case 'opacity': {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? { opacity: parsed / 100 } : null;
    }
    case 'z': {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? { zIndex: parsed } : null;
    }
    case 'backdrop':
      return value.startsWith('blur')
        ? { backdropBlur: blurAmount(value.slice(4).replace(/^-/, '')) }
        : null;
    case 'font':
      if (FONT_WEIGHTS[value] !== undefined) return { font: { weight: FONT_WEIGHTS[value] } };
      if (value === 'sans' || value === 'serif' || value === 'mono')
        return { font: { family: `{font.${value}}` } };
      return null;
    case 'tracking':
      return LETTER_SPACING[value] ? { font: { letterSpacing: LETTER_SPACING[value]! } } : null;
    case 'leading':
      return LINE_HEIGHTS[value] ? { font: { lineHeight: LINE_HEIGHTS[value]! } } : null;
    case 'text':
      return mapText(value);
    case 'bg': {
      const color = mapColor(value);
      return color ? { background: color } : null;
    }
    case 'border': {
      const width = Number(value);
      if (Number.isFinite(width)) return { border: { width, style: 'solid' } };
      const color = mapColor(value);
      return color ? { border: { color, style: 'solid', width: 1 } } : null;
    }
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/** Splits on `-`, keeping an arbitrary `[...]` value whole. */
function splitUtility(cls: string): string[] {
  const bracket = cls.indexOf('[');
  if (bracket === -1) return cls.split('-');
  return [...cls.slice(0, bracket).split('-').filter(Boolean), cls.slice(bracket)];
}

function arbitrary(value: string): string | null {
  if (!value.startsWith('[') || !value.endsWith(']')) return null;
  // Tailwind encodes spaces as underscores inside arbitrary values.
  return value.slice(1, -1).replace(/_/g, ' ');
}

function toLength(value: string): Length | null {
  const raw = arbitrary(value);
  if (raw !== null) return raw;

  if (value === 'auto') return 'auto';
  if (value === 'full') return 'fill';
  if (value === 'px') return 1;
  if (value === 'screen') return '100vh';

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (SPACING_STEPS.has(parsed)) return `{spacing.${parsed}}` as Length;
  return parsed * 4;
}

function withLength(value: string, build: (length: Length) => StyleMap): StyleMap | null {
  const length = toLength(value);
  return length === null ? null : build(length);
}

function signed(length: Length, negative: boolean): Length {
  if (!negative) return length;
  return typeof length === 'number' ? -length : `-${length}`;
}

function box(length: Length, sides: 'all' | 'x' | 'y') {
  if (sides === 'x') return { left: length, right: length };
  if (sides === 'y') return { top: length, bottom: length };
  return { top: length, right: length, bottom: length, left: length };
}

function mapAlign(value: string): StyleMap['align'] | null {
  const map: Record<string, NonNullable<StyleMap['align']>> = {
    start: 'start',
    center: 'center',
    end: 'end',
    stretch: 'stretch',
    baseline: 'baseline',
  };
  return map[value] ?? null;
}

function mapJustify(value: string): StyleMap['justify'] | null {
  const map: Record<string, NonNullable<StyleMap['justify']>> = {
    start: 'start',
    center: 'center',
    end: 'end',
    between: 'between',
    around: 'around',
    evenly: 'evenly',
  };
  return map[value] ?? null;
}

function mapMinMax(bound: 'min' | 'max', value: string): StyleMap | null {
  const [axis, ...rest] = value.split('-');
  const raw = rest.join('-');

  // The named scale is Tailwind's `max-w-*`; it reads the same for `min-w-*`,
  // which is rare enough that reusing it beats a second table.
  const length = MAX_WIDTHS[raw] ?? toLength(raw);
  if (length === null || length === undefined) return null;

  if (axis === 'w') return bound === 'max' ? { maxWidth: length } : { minWidth: length };
  if (axis === 'h') return bound === 'max' ? { maxHeight: length } : { minHeight: length };
  return null;
}

function mapRadius(value: string): StyleMap | null {
  if (RADII[value]) return { radius: RADII[value]! };

  // Side-specific radii (`rounded-t-lg`) have no structured equivalent here.
  const parts = value.split('-');
  const last = parts[parts.length - 1]!;
  return RADII[last] ? { radius: RADII[last]! } : null;
}

function blurAmount(size: string): Length {
  const map: Record<string, number> = {
    sm: 4,
    '': 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 40,
    '3xl': 64,
    none: 0,
  };
  return map[size] ?? 8;
}

function mapText(value: string): StyleMap | null {
  if (FONT_SIZES.has(value)) return { font: { size: `{size.${value}}` } };

  const raw = arbitrary(value);
  if (raw !== null) {
    return /^\d|^calc|rem$|px$|em$/.test(raw) ? { font: { size: raw } } : { color: raw };
  }

  const color = mapColor(value);
  return color ? { color } : null;
}

/** Resolves a Tailwind colour name to a token reference or a literal. */
export function mapColor(value: string): string | null {
  // Opacity modifiers (`bg-primary/10`) have no place in a colour token; the
  // base colour is kept and the class survives as passthrough only when the
  // whole utility failed, so a translucent surface degrades to a solid one
  // rather than to nothing.
  const [name] = value.split('/');
  if (!name) return null;

  const raw = arbitrary(name);
  if (raw !== null) return raw;

  if (SEMANTIC_COLORS[name]) return SEMANTIC_COLORS[name]!;

  const parts = name.split('-');
  const step = parts.length > 1 ? parts[parts.length - 1]! : '';
  const family = parts.slice(0, -1).join('-');

  if (NEUTRAL_FAMILIES.has(family) && NEUTRAL_SCALE.has(step)) return `{color.neutral.${step}}`;
  if (PRIMARY_FAMILIES.has(family) && PRIMARY_SCALE.has(step)) return `{color.primary.${step}}`;
  if ((family === 'red' || family === 'rose') && step === '500') return '{color.danger.500}';
  if ((family === 'green' || family === 'emerald') && step === '500') return '{color.success.500}';
  if ((family === 'amber' || family === 'yellow') && step === '500') return '{color.warning.500}';

  return null;
}

/**
 * Merges a patch into a style map, one level deep for the nested shapes.
 *
 * `border-2 border-border` and `px-6 py-24` each contribute half of a value;
 * a shallow assign would let the second class erase the first.
 */
export function mergeStyle(target: StyleMap, patch: StyleMap): StyleMap {
  for (const [key, value] of Object.entries(patch)) {
    const existing = (target as Record<string, unknown>)[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      (target as Record<string, unknown>)[key] = { ...existing, ...value };
    } else {
      (target as Record<string, unknown>)[key] = value;
    }
  }
  return target;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
