import type { ThemeDef, TokenGroup, TokenSet } from '@opendesign/core';

/**
 * Tokens are the contract between design and code.
 *
 * A token like `{color.primary.500}` becomes:
 *   - the CSS custom property `--color-primary-500`
 *   - a Tailwind v4 `@theme` entry, which auto-generates `bg-primary-500`,
 *     `text-primary-500`, `border-primary-500`, ...
 *
 * That is the whole trick behind readable exported code: we never emit
 * `bg-[#6366f1]`, we emit `bg-primary-500`, and the theme file carries the
 * value. Retheming an exported project stays a one-file change.
 */

export interface FlatToken {
  /** Dotted path, e.g. `color.primary.500`. */
  path: string;
  /** CSS custom property name, e.g. `--color-primary-500`. */
  cssVar: string;
  value: string | number;
  namespace: string;
}

/** Namespaces Tailwind v4 understands natively in an `@theme` block. */
const TAILWIND_NAMESPACES: Record<string, string> = {
  color: 'color',
  spacing: 'spacing',
  radius: 'radius',
  shadow: 'shadow',
  font: 'font',
  size: 'text',
};

export function flattenTokens(tokens: TokenSet | TokenGroup, prefix = ''): FlatToken[] {
  const out: FlatToken[] = [];

  for (const [key, value] of Object.entries(tokens)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null) {
      out.push(...flattenTokens(value as TokenGroup, path));
      continue;
    }

    const namespace = path.split('.')[0] ?? '';
    // `breakpoint` is consumed by the responsive engine, not by CSS variables.
    if (namespace === 'breakpoint') continue;

    out.push({
      path,
      cssVar: `--${pathToVarName(path)}`,
      value: value as string | number,
      namespace,
    });
  }

  return out;
}

function pathToVarName(path: string): string {
  const [namespace, ...rest] = path.split('.');
  const prefix = TAILWIND_NAMESPACES[namespace ?? ''] ?? namespace ?? '';
  return [prefix, ...rest].join('-');
}

export function resolveTokenPath(tokens: TokenSet, path: string): string | number | undefined {
  let cursor: unknown = tokens;
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === 'string' || typeof cursor === 'number' ? cursor : undefined;
}

/**
 * Turns `"{color.primary.500}"` into `"var(--color-primary-500)"`.
 * Non-token values pass through untouched.
 */
export function tokenToVar(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return `${value}px`;
  if (!isRef(value)) return value;
  return `var(--${pathToVarName(value.slice(1, -1))})`;
}

/** Resolves a token reference to its literal value (used by exporters and a11y checks). */
export function tokenToLiteral(
  value: string | number | undefined,
  tokens: TokenSet,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return `${value}px`;
  if (!isRef(value)) return value;
  const resolved = resolveTokenPath(tokens, value.slice(1, -1));
  return resolved === undefined ? undefined : String(resolved);
}

/** Extracts the Tailwind-facing suffix: `{color.primary.500}` -> `primary-500`. */
export function tokenSuffix(value: string): string | null {
  if (!isRef(value)) return null;
  const [, ...rest] = value.slice(1, -1).split('.');
  return rest.length > 0 ? rest.join('-') : null;
}

export function isRef(value: unknown): value is `{${string}}` {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
}

/* -------------------------------------------------------------------------- */
/*                              CSS generation                                */
/* -------------------------------------------------------------------------- */

export interface ThemeCssOptions {
  /** Emit a Tailwind v4 `@theme` block instead of a plain `:root` block. */
  tailwind?: boolean;
  /** Attribute used to switch themes at runtime. */
  themeAttribute?: string;
}

/**
 * Emits the stylesheet that carries an entire design system.
 *
 * The base token set lands in `@theme` (so Tailwind generates utilities for it)
 * and each theme lands in a `[data-theme="..."]` block that only overrides the
 * semantic tokens — which is why theme switching is instant and flicker-free.
 */
export function buildThemeCss(
  tokens: TokenSet,
  themes: ThemeDef[] = [],
  options: ThemeCssOptions = {},
): string {
  const { tailwind = true, themeAttribute = 'data-theme' } = options;
  const flat = flattenTokens(tokens);

  const lines: string[] = [];
  const selector = tailwind ? '@theme' : ':root';

  lines.push(`${selector} {`);
  for (const token of flat) {
    lines.push(`  ${token.cssVar}: ${formatValue(token.value)};`);
  }
  lines.push('}');

  for (const theme of themes) {
    const overrides = flattenTokens(theme.tokens);
    if (overrides.length === 0) continue;
    lines.push('');
    lines.push(`[${themeAttribute}='${theme.id}'] {`);
    lines.push(`  color-scheme: ${theme.appearance};`);
    for (const token of overrides) {
      lines.push(`  ${token.cssVar}: ${formatValue(token.value)};`);
    }
    lines.push('}');
  }

  return `${lines.join('\n')}\n`;
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/** Same data as `buildThemeCss`, but as an object for inline `style` props. */
export function tokensToCssVariables(tokens: TokenSet, theme?: ThemeDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of flattenTokens(tokens)) out[token.cssVar] = formatValue(token.value);
  if (theme) {
    for (const token of flattenTokens(theme.tokens)) out[token.cssVar] = formatValue(token.value);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                             Accessibility                                  */
/* -------------------------------------------------------------------------- */

function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1]!;
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. Returns `null` for non-hex inputs. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return null;
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (light + 0.05) / (dark + 0.05);
}

export interface ContrastIssue {
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  level: 'AA' | 'AAA';
}

/**
 * Checks a foreground/background pair against WCAG.
 *
 * The AI layer runs this over every generated text node: a model that picks a
 * beautiful but unreadable palette gets told to fix it before the user sees it.
 */
export function checkContrast(
  foreground: string,
  background: string,
  { level = 'AA', large = false }: { level?: 'AA' | 'AAA'; large?: boolean } = {},
): ContrastIssue | null {
  const ratio = contrastRatio(foreground, background);
  if (ratio === null) return null;

  const required = level === 'AAA' ? (large ? 4.5 : 7) : large ? 3 : 4.5;
  if (ratio >= required) return null;

  return { foreground, background, ratio: Math.round(ratio * 100) / 100, required, level };
}
