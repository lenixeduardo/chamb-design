import type { BoxValue, Breakpoint, Length, SceneNode, SizeValue, StyleMap } from '@opendesign/core';
import { isRef, tokenSuffix, tokenToVar } from './tokens.js';

/**
 * The style compiler.
 *
 * One `StyleMap` in, two outputs:
 *   - `styleToClasses` — Tailwind utility classes, used by the canvas renderer
 *     *and* by the React/Next/Vue/Svelte/Astro exporters. Preview and export
 *     share this function, which is what guarantees WYSIWYG parity.
 *   - `styleToCssProperties` — plain CSS declarations, used by the
 *     dependency-free HTML exporter and by anything Tailwind cannot express.
 *
 * Token references map to *semantic* utilities (`bg-card`, `rounded-lg`,
 * `text-2xl`) rather than arbitrary values, because the generated `@theme`
 * block defines the matching custom properties.
 */

/* -------------------------------------------------------------------------- */
/*                             Tailwind compiler                              */
/* -------------------------------------------------------------------------- */

const JUSTIFY: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
};

const ALIGN: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const DISPLAY: Record<string, string> = {
  flex: 'flex',
  'inline-flex': 'inline-flex',
  grid: 'grid',
  block: 'block',
  'inline-block': 'inline-block',
  none: 'hidden',
};

const DIRECTION: Record<string, string> = {
  row: 'flex-row',
  column: 'flex-col',
  'row-reverse': 'flex-row-reverse',
  'column-reverse': 'flex-col-reverse',
};

const TEXT_ALIGN: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
};

/** Tailwind's built-in font-weight names, so we emit `font-bold` not `font-[700]`. */
const FONT_WEIGHT: Record<number, string> = {
  100: 'font-thin',
  200: 'font-extralight',
  300: 'font-light',
  400: 'font-normal',
  500: 'font-medium',
  600: 'font-semibold',
  700: 'font-bold',
  800: 'font-extrabold',
  900: 'font-black',
};

/**
 * Length -> Tailwind scale value.
 * `{spacing.6}` -> `6`; `12` -> `[12px]`; `"2rem"` -> `[2rem]`.
 */
function scaleValue(value: Length | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return `[${value}px]`;
  if (isRef(value)) {
    const suffix = tokenSuffix(value);
    return suffix ? suffix : `[${tokenToVar(value)}]`;
  }
  return `[${value.replace(/\s+/g, '_')}]`;
}

/** Named-scale value that must exist in the theme (radius, shadow, font, text). */
function namedValue(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value === 'number') return `[${value}px]`;
  if (isRef(value)) {
    const suffix = tokenSuffix(value);
    return suffix ?? `[${tokenToVar(value)}]`;
  }
  return `[${value.replace(/\s+/g, '_')}]`;
}

function colorValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (isRef(value)) {
    // `{color.card}` -> `card`; `{color.primary.500}` -> `primary-500`.
    return tokenSuffix(value);
  }
  return `[${value.replace(/\s+/g, '_')}]`;
}

function sizeClasses(prefix: 'w' | 'h', value: SizeValue | undefined): string[] {
  if (value === undefined) return [];
  if (value === 'fill') return [`${prefix}-full`];
  if (value === 'hug') return [`${prefix}-fit`];
  if (value === 'auto') return [`${prefix}-auto`];
  if (value === '100%') return [`${prefix}-full`];
  const scaled = scaleValue(value);
  return scaled ? [`${prefix}-${scaled}`] : [];
}

function boxClasses(prefix: 'p' | 'm', box: BoxValue | undefined): string[] {
  if (!box) return [];

  const { top, right, bottom, left } = box;
  const t = scaleValue(top);
  const r = scaleValue(right);
  const b = scaleValue(bottom);
  const l = scaleValue(left);

  // Collapse to the shortest correct form: p-4 > py-4 px-6 > pt-4 pr-6 ...
  if (t && t === r && t === b && t === l) return [`${prefix}-${t}`];

  const classes: string[] = [];
  if (t && t === b) classes.push(`${prefix}y-${t}`);
  else {
    if (t) classes.push(`${prefix}t-${t}`);
    if (b) classes.push(`${prefix}b-${b}`);
  }
  if (l && l === r) classes.push(`${prefix}x-${l}`);
  else {
    if (l) classes.push(`${prefix}l-${l}`);
    if (r) classes.push(`${prefix}r-${r}`);
  }
  return classes;
}

function insetClasses(box: BoxValue | undefined): string[] {
  if (!box) return [];
  const classes: string[] = [];
  const map = { top: 'top', right: 'right', bottom: 'bottom', left: 'left' } as const;
  for (const [key, prefix] of Object.entries(map) as [keyof BoxValue, string][]) {
    const scaled = scaleValue(box[key]);
    if (scaled) classes.push(`${prefix}-${scaled}`);
  }
  return classes;
}

export interface CompileOptions {
  /** Prefixes every class, e.g. `lg` produces `lg:flex`. */
  breakpoint?: Exclude<Breakpoint, 'base'>;
}

/** Compiles a `StyleMap` into a deduplicated list of Tailwind classes. */
export function styleToClasses(style: StyleMap, options: CompileOptions = {}): string[] {
  const c: string[] = [];

  if (style.display) c.push(DISPLAY[style.display] ?? '');
  if (style.direction) c.push(DIRECTION[style.direction] ?? '');
  if (style.wrap) c.push('flex-wrap');
  if (style.justify) c.push(JUSTIFY[style.justify] ?? '');
  if (style.align) c.push(ALIGN[style.align] ?? '');

  const gap = scaleValue(style.gap);
  if (gap) c.push(`gap-${gap}`);

  if (style.gridColumns !== undefined) {
    c.push(
      typeof style.gridColumns === 'number'
        ? `grid-cols-${style.gridColumns}`
        : `grid-cols-[${String(style.gridColumns).replace(/\s+/g, '_')}]`,
    );
  }
  if (style.gridRows !== undefined) {
    c.push(
      typeof style.gridRows === 'number'
        ? `grid-rows-${style.gridRows}`
        : `grid-rows-[${String(style.gridRows).replace(/\s+/g, '_')}]`,
    );
  }
  if (style.colSpan) c.push(`col-span-${style.colSpan}`);
  if (style.rowSpan) c.push(`row-span-${style.rowSpan}`);

  c.push(...boxClasses('p', style.padding));
  c.push(...boxClasses('m', style.margin));

  c.push(...sizeClasses('w', style.width));
  c.push(...sizeClasses('h', style.height));

  const minW = scaleValue(style.minWidth);
  if (minW) c.push(`min-w-${minW}`);
  const minH = scaleValue(style.minHeight);
  if (minH) c.push(`min-h-${minH}`);
  const maxW = scaleValue(style.maxWidth);
  if (maxW) c.push(`max-w-${maxW}`);
  const maxH = scaleValue(style.maxHeight);
  if (maxH) c.push(`max-h-${maxH}`);

  if (style.position && style.position !== 'static') c.push(style.position);
  c.push(...insetClasses(style.inset));
  if (style.zIndex !== undefined) c.push(`z-[${style.zIndex}]`);

  const bg = colorValue(style.background);
  if (bg) c.push(bg.startsWith('[') ? `bg-${bg}` : `bg-${bg}`);

  const color = colorValue(style.color);
  if (color) c.push(`text-${color}`);

  if (style.border) {
    const width = style.border.width;
    if (width !== undefined) {
      c.push(width === 1 ? 'border' : `border-${scaleValue(width)}`);
    }
    if (style.border.style && style.border.style !== 'solid') c.push(`border-${style.border.style}`);
    const borderColor = colorValue(style.border.color);
    if (borderColor) c.push(`border-${borderColor}`);
  }

  if (style.radius !== undefined) {
    if (typeof style.radius === 'object') {
      const map = {
        top: 'rounded-t',
        right: 'rounded-r',
        bottom: 'rounded-b',
        left: 'rounded-l',
      } as const;
      for (const [key, prefix] of Object.entries(map) as [keyof BoxValue, string][]) {
        const value = namedValue(style.radius[key]);
        if (value) c.push(`${prefix}-${value}`);
      }
    } else {
      const radius = namedValue(style.radius);
      if (radius) c.push(`rounded-${radius}`);
    }
  }

  const shadow = namedValue(style.shadow);
  if (shadow) c.push(shadow === 'none' ? 'shadow-none' : `shadow-${shadow}`);

  if (style.opacity !== undefined) c.push(`opacity-${Math.round(style.opacity * 100)}`);

  const blur = scaleValue(style.backdropBlur);
  if (blur) c.push(`backdrop-blur-${blur}`);

  if (style.overflow) c.push(`overflow-${style.overflow}`);
  if (style.cursor) c.push(`cursor-${style.cursor}`);
  if (style.aspectRatio) c.push(`aspect-[${style.aspectRatio.replace(/\s+/g, '')}]`);

  if (style.font) {
    const { family, size, weight, lineHeight, letterSpacing, align, transform, italic, decoration } =
      style.font;

    const familyValue = namedValue(family);
    if (familyValue) c.push(`font-${familyValue}`);

    const sizeValue = namedValue(size);
    if (sizeValue) c.push(`text-${sizeValue}`);

    if (weight !== undefined) c.push(FONT_WEIGHT[weight] ?? `font-[${weight}]`);

    const lh = scaleValue(lineHeight);
    if (lh) c.push(`leading-${lh}`);

    const ls = scaleValue(letterSpacing);
    if (ls) c.push(`tracking-${ls}`);

    if (align) c.push(TEXT_ALIGN[align] ?? '');
    if (transform && transform !== 'none') c.push(transform);
    if (italic) c.push('italic');
    if (decoration && decoration !== 'none') c.push(decoration);
  }

  if (style.transition) c.push(`transition-[${style.transition.replace(/\s+/g, '_')}]`);
  if (style.transform) c.push(`[transform:${style.transform.replace(/\s+/g, '_')}]`);

  const cleaned = dedupe(c.filter(Boolean));
  return options.breakpoint ? cleaned.map((cls) => `${options.breakpoint}:${cls}`) : cleaned;
}

function dedupe(classes: string[]): string[] {
  return [...new Set(classes)];
}

/** Full class list for a node: base + every responsive override + escape hatch. */
export function nodeToClassName(node: SceneNode): string {
  const classes = styleToClasses(node.style);

  for (const [breakpoint, override] of Object.entries(node.responsive ?? {})) {
    classes.push(
      ...styleToClasses(override, { breakpoint: breakpoint as Exclude<Breakpoint, 'base'> }),
    );
  }

  if (node.className) classes.push(...node.className.split(/\s+/).filter(Boolean));
  if (node.hidden) classes.push('hidden');

  return dedupe(classes).join(' ');
}

/* -------------------------------------------------------------------------- */
/*                               CSS compiler                                 */
/* -------------------------------------------------------------------------- */

function cssLength(value: Length | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return `${value}px`;
  return tokenToVar(value);
}

function cssBox(box: BoxValue | undefined): string | undefined {
  if (!box) return undefined;
  const top = cssLength(box.top) ?? '0';
  const right = cssLength(box.right) ?? '0';
  const bottom = cssLength(box.bottom) ?? '0';
  const left = cssLength(box.left) ?? '0';
  return `${top} ${right} ${bottom} ${left}`;
}

function cssSize(value: SizeValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === 'fill') return '100%';
  if (value === 'hug') return 'fit-content';
  if (value === 'auto') return 'auto';
  return cssLength(value);
}

const FLEX_ALIGN: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
};

/**
 * Plain CSS declarations, keyed by kebab-case property.
 *
 * Used by the HTML exporter (which ships zero dependencies) and by the canvas
 * for the handful of properties Tailwind cannot express losslessly.
 */
export function styleToCssProperties(style: StyleMap): Record<string, string> {
  const css: Record<string, string> = {};
  const set = (property: string, value: string | undefined) => {
    if (value !== undefined && value !== '') css[property] = value;
  };

  set('display', style.display);
  set('flex-direction', style.direction);
  if (style.wrap) set('flex-wrap', 'wrap');
  set('justify-content', style.justify ? FLEX_ALIGN[style.justify] : undefined);
  set('align-items', style.align ? FLEX_ALIGN[style.align] : undefined);
  set('gap', cssLength(style.gap));

  if (style.gridColumns !== undefined) {
    set(
      'grid-template-columns',
      typeof style.gridColumns === 'number'
        ? `repeat(${style.gridColumns}, minmax(0, 1fr))`
        : style.gridColumns,
    );
  }
  if (style.gridRows !== undefined) {
    set(
      'grid-template-rows',
      typeof style.gridRows === 'number'
        ? `repeat(${style.gridRows}, minmax(0, 1fr))`
        : style.gridRows,
    );
  }
  if (style.colSpan) set('grid-column', `span ${style.colSpan} / span ${style.colSpan}`);
  if (style.rowSpan) set('grid-row', `span ${style.rowSpan} / span ${style.rowSpan}`);

  set('padding', cssBox(style.padding));
  set('margin', cssBox(style.margin));

  set('width', cssSize(style.width));
  set('height', cssSize(style.height));
  set('min-width', cssLength(style.minWidth));
  set('min-height', cssLength(style.minHeight));
  set('max-width', cssLength(style.maxWidth));
  set('max-height', cssLength(style.maxHeight));

  set('position', style.position);
  if (style.inset) {
    set('top', cssLength(style.inset.top));
    set('right', cssLength(style.inset.right));
    set('bottom', cssLength(style.inset.bottom));
    set('left', cssLength(style.inset.left));
  }
  if (style.zIndex !== undefined) set('z-index', String(style.zIndex));

  set('background', tokenToVar(style.background));
  set('color', tokenToVar(style.color));

  if (style.border) {
    const width = cssLength(style.border.width) ?? '1px';
    const lineStyle = style.border.style ?? 'solid';
    const color = tokenToVar(style.border.color) ?? 'currentColor';
    if (lineStyle !== 'none') set('border', `${width} ${lineStyle} ${color}`);
  }

  if (style.radius !== undefined) {
    set(
      'border-radius',
      typeof style.radius === 'object' ? cssBox(style.radius) : cssLength(style.radius),
    );
  }

  set('box-shadow', tokenToVar(style.shadow));
  if (style.opacity !== undefined) set('opacity', String(style.opacity));
  if (style.backdropBlur !== undefined) {
    set('backdrop-filter', `blur(${cssLength(style.backdropBlur)})`);
  }
  set('overflow', style.overflow);
  set('cursor', style.cursor);
  set('aspect-ratio', style.aspectRatio);

  if (style.font) {
    set('font-family', tokenToVar(style.font.family));
    set('font-size', cssLength(style.font.size));
    if (style.font.weight !== undefined) set('font-weight', String(style.font.weight));
    set('line-height', cssLength(style.font.lineHeight));
    set('letter-spacing', cssLength(style.font.letterSpacing));
    set('text-align', style.font.align);
    set('text-transform', style.font.transform);
    if (style.font.italic) set('font-style', 'italic');
    set('text-decoration', style.font.decoration);
  }

  set('transition', style.transition);
  set('transform', style.transform);

  return css;
}

/** Converts kebab-case CSS declarations into a React `style` object. */
export function toReactStyle(css: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(css)) {
    out[key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  return out;
}

/** Serializes declarations into a CSS rule body. */
export function cssPropertiesToString(css: Record<string, string>, indent = '  '): string {
  return Object.entries(css)
    .map(([key, value]) => `${indent}${key}: ${value};`)
    .join('\n');
}
