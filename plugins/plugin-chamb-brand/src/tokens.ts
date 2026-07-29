import type { ThemeDef, TokenSet } from '@opendesign/core';

/**
 * The chamb-design brand.
 *
 * Derived from the reference material rather than invented: warm cream paper,
 * one loud signal red, near-black ink, and a light serif italic for display.
 * The distinguishing move is that it is a **light, warm** system in a category
 * that defaults to dark neutrals — so the semantic tokens carry the warmth
 * rather than every block hard-coding it.
 *
 * Three decisions worth naming:
 *
 *  - **Cream, not white.** `#FFFCF5` reads as paper. Pure white next to the red
 *    goes clinical, which is the opposite of the intent.
 *  - **Hairlines are black at low alpha**, not a grey. On a warm background a
 *    grey border turns muddy; `rgb(0 0 0 / 0.08)` stays neutral against any
 *    surface tint.
 *  - **Radii are large and paired.** Pills for actions, 14–16px for surfaces.
 *    Mixing a 4px input with a pill button is the fastest way to lose the
 *    character, so the scale simply has no small step.
 */

export const CHAMB_RED = '#E83D3D';
export const CHAMB_RED_DEEP = '#D12F2F';
export const CHAMB_CREAM = '#FFFCF5';
export const CHAMB_INK = '#121211';

export function chambTokens(): TokenSet {
  return {
    color: {
      // The one loud colour. Everything else stays quiet so it can shout.
      red: {
        50: '#FEF2F2',
        100: '#FDE4E4',
        200: '#FBC9C9',
        300: '#F7A3A3',
        400: '#F06E6E',
        500: CHAMB_RED,
        600: CHAMB_RED_DEEP,
        700: '#B02525',
        800: '#8F2020',
        900: '#701C1C',
      },
      // Warm neutrals: every step carries a little yellow so nothing looks
      // grey-blue against the cream.
      sand: {
        50: CHAMB_CREAM,
        100: '#FFFEFB',
        200: '#F6F2E9',
        300: '#EBE5D8',
        400: '#D6CEBD',
        500: '#A9A192',
        600: '#7A7367',
        700: '#4A4540',
        800: '#26241F',
        900: '#1A1A18',
        950: CHAMB_INK,
      },
      success: { 500: '#2E9E5B' },
      warning: { 500: '#D98324' },
      danger: { 500: CHAMB_RED },

      // Semantic — what blocks actually reference.
      background: CHAMB_CREAM,
      foreground: CHAMB_INK,
      muted: '#F6F2E9',
      'muted-foreground': '#7A7367',
      card: '#FFFFFF',
      border: 'rgb(0 0 0 / 0.08)',
      accent: CHAMB_RED,
      'accent-foreground': '#FFFFFF',
      ring: CHAMB_RED,
      // Inverted surface for the dark cards the reference uses as punctuation.
      contrast: '#111111',
      'contrast-foreground': '#FFFCF5',
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
      // No small step on purpose — see the note above.
      sm: '8px',
      md: '12px',
      lg: '14px',
      xl: '16px',
      '2xl': '24px',
      full: '9999px',
    },
    shadow: {
      none: 'none',
      sm: '0 1px 2px 0 rgb(18 18 17 / 0.05)',
      md: '0 4px 14px -4px rgb(18 18 17 / 0.10)',
      lg: '0 12px 32px -12px rgb(18 18 17 / 0.16)',
      xl: '0 24px 60px -20px rgb(18 18 17 / 0.22)',
      // The signature: a coloured lift under primary actions.
      signal: '0 8px 24px rgb(232 61 61 / 0.35)',
      glass: '0 8px 32px -8px rgb(18 18 17 / 0.18)',
    },
    font: {
      sans: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
      // Display is a light serif italic — the whole personality lives here.
      display: '"Instrument Serif", "Playfair Display", ui-serif, Georgia, serif',
      serif: '"Instrument Serif", ui-serif, Georgia, serif',
      mono: 'ui-monospace, "SF Mono", Menlo, monospace',
    },
    size: {
      xs: '11px',
      sm: '13px',
      base: '15px',
      lg: '17px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '38px',
      '5xl': '48px',
      '6xl': '60px',
      '7xl': '76px',
    },
    breakpoint: { base: 0, sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 },
  };
}

export function chambThemes(): ThemeDef[] {
  return [
    {
      id: 'chamb-light',
      name: 'Chamb Cream',
      appearance: 'light',
      tokens: {
        color: {
          background: CHAMB_CREAM,
          foreground: CHAMB_INK,
          muted: '#F6F2E9',
          'muted-foreground': '#7A7367',
          card: '#FFFFFF',
          border: 'rgb(0 0 0 / 0.08)',
          accent: CHAMB_RED,
          'accent-foreground': '#FFFFFF',
          contrast: '#111111',
          'contrast-foreground': CHAMB_CREAM,
        },
      },
    },
    {
      // Not a straight inversion: the red brightens so it survives on dark, and
      // the "contrast" surface flips to cream so inverted cards still invert.
      id: 'chamb-dark',
      name: 'Chamb Midnight',
      appearance: 'dark',
      tokens: {
        color: {
          background: '#141311',
          foreground: '#F7F3EA',
          muted: '#221F1B',
          'muted-foreground': '#A9A192',
          card: '#1B1917',
          border: 'rgb(255 255 255 / 0.10)',
          accent: '#FF5A5A',
          'accent-foreground': '#1A0D0D',
          contrast: CHAMB_CREAM,
          'contrast-foreground': CHAMB_INK,
        },
      },
    },
  ];
}
