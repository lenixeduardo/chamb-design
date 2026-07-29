import type { ThemeDef, TokenSet } from './types.js';

/**
 * OpenDesign's starter design system.
 *
 * Semantic tokens (`background`, `foreground`, `muted`, ...) are theme-aware and
 * get remapped by each theme; scale tokens (`primary.500`, `neutral.900`, ...)
 * are theme-independent raw values. Editing a semantic token retheme the whole
 * project without touching a single node.
 */
export function defaultTokens(): TokenSet {
  return {
    color: {
      primary: {
        50: '#eef2ff',
        100: '#e0e7ff',
        200: '#c7d2fe',
        300: '#a5b4fc',
        400: '#818cf8',
        500: '#6366f1',
        600: '#4f46e5',
        700: '#4338ca',
        800: '#3730a3',
        900: '#312e81',
      },
      neutral: {
        50: '#fafafa',
        100: '#f4f4f5',
        200: '#e4e4e7',
        300: '#d4d4d8',
        400: '#a1a1aa',
        500: '#71717a',
        600: '#52525b',
        700: '#3f3f46',
        800: '#27272a',
        900: '#18181b',
        950: '#09090b',
      },
      success: { 500: '#10b981' },
      warning: { 500: '#f59e0b' },
      danger: { 500: '#ef4444' },

      // Semantic — overridden per theme.
      background: '#09090b',
      foreground: '#fafafa',
      muted: '#18181b',
      'muted-foreground': '#a1a1aa',
      card: '#111113',
      border: '#27272a',
      accent: '#6366f1',
      'accent-foreground': '#ffffff',
      ring: '#6366f1',
    },
    spacing: {
      0: '0px',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      10: '40px',
      12: '48px',
      16: '64px',
      20: '80px',
      24: '96px',
      32: '128px',
    },
    radius: {
      none: '0px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
      '2xl': '24px',
      full: '9999px',
    },
    shadow: {
      none: 'none',
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.06)',
      md: '0 4px 12px -2px rgb(0 0 0 / 0.12)',
      lg: '0 12px 32px -8px rgb(0 0 0 / 0.24)',
      xl: '0 24px 64px -16px rgb(0 0 0 / 0.32)',
      glass: '0 8px 32px -8px rgb(0 0 0 / 0.36), inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
    },
    font: {
      sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
      serif: 'ui-serif, Georgia, serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      display: 'Inter, ui-sans-serif, system-ui, sans-serif',
    },
    size: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
      '6xl': '60px',
      '7xl': '72px',
    },
    breakpoint: {
      base: 0,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1536,
    },
  };
}

export function defaultThemes(): ThemeDef[] {
  return [
    {
      id: 'dark',
      name: 'Dark',
      appearance: 'dark',
      tokens: {
        color: {
          background: '#09090b',
          foreground: '#fafafa',
          muted: '#18181b',
          'muted-foreground': '#a1a1aa',
          card: '#111113',
          border: '#27272a',
          accent: '#6366f1',
          'accent-foreground': '#ffffff',
          ring: '#6366f1',
        },
      },
    },
    {
      id: 'light',
      name: 'Light',
      appearance: 'light',
      tokens: {
        color: {
          background: '#ffffff',
          foreground: '#09090b',
          muted: '#f4f4f5',
          'muted-foreground': '#71717a',
          card: '#ffffff',
          border: '#e4e4e7',
          accent: '#4f46e5',
          'accent-foreground': '#ffffff',
          ring: '#4f46e5',
        },
      },
    },
  ];
}
