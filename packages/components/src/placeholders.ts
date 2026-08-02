import type { TokenSet } from '@opendesign/core';

/**
 * Inline placeholder imagery.
 *
 * A template with no pictures reads as a wireframe, and "add your own image"
 * is a worse first impression than a real one. These are SVG data URIs built
 * from the project's own tokens, which buys three things a stock photo URL
 * does not:
 *
 *  - **They render offline.** A document stays one portable JSON file, which
 *    is the same promise the asset pipeline makes for dropped images.
 *  - **They wear the theme.** The placeholder in a chamb project is cream and
 *    signal red; retheme the project and the next one that is built follows.
 *  - **They are honest.** An abstract UI mock reads as a placeholder, where a
 *    photograph of a real office reads as content someone forgot to replace.
 *
 * Each is a couple of hundred bytes. Base64 rather than percent-encoding
 * because every value here contains `#`, which is a fragment delimiter in a
 * plain data URI and silently truncates the image.
 */

export interface PlaceholderPalette {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  border: string;
}

const FALLBACK: PlaceholderPalette = {
  background: '#ffffff',
  foreground: '#18181b',
  muted: '#f4f4f5',
  accent: '#6366f1',
  border: '#e4e4e7',
};

/** Reads the semantic colours a placeholder needs, with sane fallbacks. */
export function paletteFromTokens(tokens?: TokenSet): PlaceholderPalette {
  const color = (tokens?.color ?? {}) as Record<string, unknown>;
  const pick = (name: keyof PlaceholderPalette): string => {
    const value = color[name];
    return typeof value === 'string' && value.trim() ? value : FALLBACK[name];
  };

  return {
    background: pick('background'),
    foreground: pick('foreground'),
    muted: pick('muted'),
    accent: pick('accent'),
    border: pick('border'),
  };
}

/**
 * An abstract product screenshot: window chrome, a sidebar, a chart.
 *
 * Deliberately not a picture of anything. It is the shape of a product, which
 * is what a hero's visual slot is communicating before real content exists.
 */
export function screenshotPlaceholder(palette: PlaceholderPalette = FALLBACK): string {
  const bars = [38, 56, 44, 72, 62, 88];

  const chart = bars
    .map((height, index) => {
      const x = 132 + index * 34;
      const y = 168 - height;
      const fill = index === bars.length - 1 ? palette.accent : withAlpha(palette.accent, 0.35);
      return `<rect x="${x}" y="${y}" width="22" height="${height}" rx="4" fill="${fill}"/>`;
    })
    .join('');

  const rows = [0, 1, 2]
    .map(
      (index) =>
        `<rect x="132" y="${188 + index * 18}" width="${210 - index * 46}" height="8" rx="4" fill="${palette.border}"/>`,
    )
    .join('');

  const navigation = [0, 1, 2, 3]
    .map(
      (index) =>
        `<rect x="28" y="${66 + index * 22}" width="${index === 0 ? 68 : 54}" height="9" rx="4.5" fill="${
          index === 0 ? withAlpha(palette.accent, 0.55) : palette.border
        }"/>`,
    )
    .join('');

  return svg(
    400,
    300,
    [
      `<rect width="400" height="300" rx="16" fill="${palette.background}"/>`,
      `<rect x="0.5" y="0.5" width="399" height="299" rx="15.5" fill="none" stroke="${palette.border}"/>`,
      `<rect x="0" y="0" width="400" height="40" rx="16" fill="${palette.muted}"/>`,
      `<rect x="0" y="24" width="400" height="16" fill="${palette.muted}"/>`,
      `<circle cx="24" cy="20" r="5" fill="${palette.accent}"/>`,
      `<rect x="38" y="16" width="72" height="8" rx="4" fill="${palette.border}"/>`,
      `<rect x="16" y="52" width="96" height="232" rx="10" fill="${palette.muted}"/>`,
      navigation,
      `<rect x="120" y="52" width="264" height="232" rx="10" fill="${palette.muted}"/>`,
      chart,
      rows,
    ].join(''),
  );
}

/**
 * A soft abstract composition, seeded by a string.
 *
 * The seed is what keeps a gallery of six from looking like the same tile
 * repeated: same palette, different arrangement.
 */
export function photoPlaceholder(palette: PlaceholderPalette = FALLBACK, seed = ''): string {
  const random = hash(seed);
  const angle = random % 90;
  const cx = 90 + (random % 140);
  const cy = 70 + ((random >> 3) % 120);
  const radius = 48 + ((random >> 5) % 44);
  const id = `g${random.toString(36)}`;

  return svg(
    400,
    300,
    [
      `<defs><linearGradient id="${id}" gradientTransform="rotate(${angle})">`,
      `<stop offset="0%" stop-color="${withAlpha(palette.accent, 0.28)}"/>`,
      `<stop offset="100%" stop-color="${palette.muted}"/>`,
      `</linearGradient></defs>`,
      `<rect width="400" height="300" fill="${palette.muted}"/>`,
      `<rect width="400" height="300" fill="url(#${id})"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${withAlpha(palette.accent, 0.14)}"/>`,
      `<circle cx="${400 - cx}" cy="${300 - cy}" r="${radius * 0.55}" fill="${withAlpha(palette.foreground, 0.05)}"/>`,
      // A horizon, low in the frame: enough structure to read as an image
      // rather than as a swatch, without pretending to be a photograph.
      `<path d="M0 ${232 + (random % 18)} Q 120 ${206 + (random % 30)} 400 ${240 - (random % 22)} L400 300 L0 300 Z" fill="${withAlpha(palette.foreground, 0.06)}"/>`,
    ].join(''),
  );
}

/** Initials on a tinted disc — a stand-in portrait that is not a stranger's face. */
export function avatarPlaceholder(name: string, palette: PlaceholderPalette = FALLBACK): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return svg(
    96,
    96,
    [
      `<circle cx="48" cy="48" r="48" fill="${withAlpha(palette.accent, 0.18)}"/>`,
      `<text x="48" y="48" text-anchor="middle" dominant-baseline="central"`,
      ` font-family="system-ui, sans-serif" font-size="34" font-weight="600" fill="${palette.accent}">`,
      escapeText(initials),
      `</text>`,
    ].join(''),
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Internals                                 */
/* -------------------------------------------------------------------------- */

function svg(width: number, height: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
  return `data:image/svg+xml;base64,${toBase64(markup)}`;
}

/**
 * A colour with an alpha channel, for either notation the tokens use.
 *
 * `color-mix` would be tidier but SVG in a data URI is rendered outside the
 * document's CSS context, so relative colour syntax has nothing to resolve
 * against — the value has to be self-contained.
 */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const value = hex[1]!;
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const short = /^#([0-9a-f]{3})$/i.exec(color.trim());
  if (short) {
    const [r, g, b] = [...short[1]!].map((digit) => parseInt(digit + digit, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Named colours and anything exotic: let the browser resolve it opaque
  // rather than emitting an invalid `rgba()`.
  return color;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Small, stable, non-cryptographic — it only has to vary the arrangement. */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);

  const nodeBuffer = (
    globalThis as {
      Buffer?: { from: (input: Uint8Array) => { toString: (encoding: string) => string } };
    }
  ).Buffer;
  if (nodeBuffer) return nodeBuffer.from(bytes).toString('base64');

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
