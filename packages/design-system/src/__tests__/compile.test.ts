import { describe, expect, it } from 'vitest';
import { defaultTokens, defaultThemes, createNode } from '@opendesign/core';
import {
  nodeToClassName,
  styleToClasses,
  styleToCssProperties,
  toReactStyle,
} from '../compile.js';
import { buildThemeCss, checkContrast, contrastRatio, flattenTokens, tokenToVar } from '../tokens.js';

describe('token plumbing', () => {
  it('flattens tokens into Tailwind-compatible custom properties', () => {
    const flat = flattenTokens(defaultTokens());
    const byPath = Object.fromEntries(flat.map((t) => [t.path, t.cssVar]));

    expect(byPath['color.primary.500']).toBe('--color-primary-500');
    expect(byPath['spacing.4']).toBe('--spacing-4');
    expect(byPath['radius.lg']).toBe('--radius-lg');
    // `size` is Tailwind's font-size namespace.
    expect(byPath['size.2xl']).toBe('--text-2xl');
  });

  it('excludes breakpoints, which are not CSS variables', () => {
    const paths = flattenTokens(defaultTokens()).map((t) => t.path);
    expect(paths.some((p) => p.startsWith('breakpoint.'))).toBe(false);
  });

  it('resolves references to var() and leaves literals alone', () => {
    expect(tokenToVar('{color.card}')).toBe('var(--color-card)');
    expect(tokenToVar('{spacing.6}')).toBe('var(--spacing-6)');
    expect(tokenToVar('#ff0000')).toBe('#ff0000');
    expect(tokenToVar(12)).toBe('12px');
  });

  it('emits a Tailwind @theme block plus per-theme overrides', () => {
    const css = buildThemeCss(defaultTokens(), defaultThemes());
    expect(css).toContain('@theme {');
    expect(css).toContain('--color-primary-500: #6366f1;');
    expect(css).toContain("[data-theme='light'] {");
    expect(css).toContain('color-scheme: light;');
  });
});

describe('tailwind compiler', () => {
  it('maps layout primitives', () => {
    const classes = styleToClasses({
      display: 'flex',
      direction: 'column',
      justify: 'between',
      align: 'center',
      gap: '{spacing.6}',
    });
    expect(classes).toEqual(['flex', 'flex-col', 'justify-between', 'items-center', 'gap-6']);
  });

  it('collapses uniform padding to a single utility', () => {
    expect(
      styleToClasses({
        padding: {
          top: '{spacing.4}',
          right: '{spacing.4}',
          bottom: '{spacing.4}',
          left: '{spacing.4}',
        },
      }),
    ).toEqual(['p-4']);
  });

  it('collapses symmetric padding to axis utilities', () => {
    expect(
      styleToClasses({
        padding: {
          top: '{spacing.4}',
          bottom: '{spacing.4}',
          left: '{spacing.8}',
          right: '{spacing.8}',
        },
      }),
    ).toEqual(['py-4', 'px-8']);
  });

  it('falls back to per-side utilities when sides differ', () => {
    expect(
      styleToClasses({ padding: { top: '{spacing.2}', bottom: '{spacing.8}' } }),
    ).toEqual(['pt-2', 'pb-8']);
  });

  it('emits semantic color utilities for token refs and arbitrary values otherwise', () => {
    expect(styleToClasses({ background: '{color.card}' })).toEqual(['bg-card']);
    expect(styleToClasses({ color: '{color.primary.500}' })).toEqual(['text-primary-500']);
    expect(styleToClasses({ background: '#ff0055' })).toEqual(['bg-[#ff0055]']);
  });

  it('maps sizing keywords', () => {
    expect(styleToClasses({ width: 'fill', height: 'hug' })).toEqual(['w-full', 'h-fit']);
    expect(styleToClasses({ width: 320 })).toEqual(['w-[320px]']);
  });

  it('maps typography with named font weights', () => {
    expect(
      styleToClasses({ font: { family: '{font.sans}', size: '{size.4xl}', weight: 700 } }),
    ).toEqual(['font-sans', 'text-4xl', 'font-bold']);
  });

  it('prefixes every class for a responsive override', () => {
    expect(styleToClasses({ direction: 'row', gap: '{spacing.8}' }, { breakpoint: 'lg' })).toEqual([
      'lg:flex-row',
      'lg:gap-8',
    ]);
  });

  it('merges base, responsive and escape-hatch classes on a node', () => {
    const node = createNode({ type: 'frame', style: { display: 'flex', direction: 'column' } });
    node.responsive = { lg: { direction: 'row' } };
    node.className = 'group/card';

    const className = nodeToClassName(node);
    expect(className).toContain('flex-col');
    expect(className).toContain('lg:flex-row');
    expect(className).toContain('group/card');
  });

  it('never emits duplicate classes', () => {
    const node = createNode({ type: 'frame', style: { display: 'flex' } });
    node.className = 'flex';
    expect(nodeToClassName(node).split(' ').filter((c) => c === 'flex')).toHaveLength(1);
  });
});

describe('css compiler', () => {
  it('produces dependency-free CSS declarations', () => {
    const css = styleToCssProperties({
      display: 'flex',
      justify: 'between',
      gap: '{spacing.4}',
      background: '{color.card}',
      radius: '{radius.lg}',
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
    });

    expect(css).toMatchObject({
      display: 'flex',
      'justify-content': 'space-between',
      gap: 'var(--spacing-4)',
      background: 'var(--color-card)',
      'border-radius': 'var(--radius-lg)',
      padding: '16px 24px 16px 24px',
    });
  });

  it('expands numeric grid columns into a repeat()', () => {
    expect(styleToCssProperties({ gridColumns: 3 })['grid-template-columns']).toBe(
      'repeat(3, minmax(0, 1fr))',
    );
  });

  it('converts declarations to React style keys', () => {
    expect(toReactStyle({ 'background-color': 'red', 'z-index': '3' })).toEqual({
      backgroundColor: 'red',
      zIndex: '3',
    });
  });
});

describe('accessibility helpers', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('flags text that fails AA and passes text that clears it', () => {
    expect(checkContrast('#777777', '#808080')).not.toBeNull();
    expect(checkContrast('#ffffff', '#09090b')).toBeNull();
  });

  it('applies the relaxed threshold for large text', () => {
    expect(checkContrast('#8a8a8a', '#ffffff', { large: true })).toBeNull();
    expect(checkContrast('#8a8a8a', '#ffffff', { large: false })).not.toBeNull();
  });
});
