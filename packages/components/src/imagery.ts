import {
  pickStockPhoto,
  pickStockPhotos,
  stockPhotoUrl,
  STOCK_TOPICS,
  type StockPhoto,
  type StockTopic,
} from '@opendesign/assets';
import {
  photoPlaceholder,
  screenshotPlaceholder,
  type PlaceholderPalette,
} from './placeholders.js';

/**
 * Where a block's imagery comes from.
 *
 * Two modes rather than a provider name, because the choice a page makes is
 * not "Unsplash or Pexels", it is "a photograph or a drawing of one":
 *
 *  - `stock` — a real photograph from `@opendesign/assets`, addressed on the
 *    Unsplash CDN. What someone building a page in the app wants: a template
 *    that opens on abstract gradients reads as a wireframe.
 *  - `placeholder` — the SVG built from the project's own tokens. Renders with
 *    no network, wears the theme, and reads as a placeholder. What the
 *    committed examples use, and what anything offline falls back to.
 *
 * Both lose to an explicit `image` prop. That order — explicit, then stock,
 * then placeholder — is the whole of this module, and it lives here so the
 * four blocks with an image slot do not each re-implement it.
 */
export type ImageryMode = 'placeholder' | 'stock';

export const IMAGERY_MODES: readonly ImageryMode[] = ['placeholder', 'stock'];

/**
 * The two prop vocabularies, ready for a `ComponentPropDef`.
 *
 * Exported so every block with an image slot offers the inspector the same
 * choices in the same order, rather than each one spelling out its own list.
 */
export const IMAGERY_MODE_OPTIONS: readonly { label: string; value: ImageryMode }[] = [
  { label: 'Illustration (offline)', value: 'placeholder' },
  { label: 'Photo (Unsplash)', value: 'stock' },
];

export const STOCK_TOPIC_OPTIONS: readonly { label: string; value: StockTopic }[] = [
  { label: 'Product', value: 'product' },
  { label: 'Workspace', value: 'workspace' },
  { label: 'Team', value: 'team' },
  { label: 'Retail', value: 'retail' },
  { label: 'Craft', value: 'craft' },
  { label: 'Food', value: 'food' },
  { label: 'Nature', value: 'nature' },
  { label: 'Abstract', value: 'abstract' },
];

/** Reads an `imagery` prop, tolerating anything a plugin or a paste puts there. */
export function toImageryMode(value: unknown, fallback: ImageryMode = 'placeholder'): ImageryMode {
  return value === 'stock' || value === 'placeholder' ? value : fallback;
}

/** Reads a `topic` prop against the catalog's vocabulary. */
export function toStockTopic(value: unknown, fallback: StockTopic): StockTopic {
  return typeof value === 'string' && (STOCK_TOPICS as readonly string[]).includes(value)
    ? (value as StockTopic)
    : fallback;
}

export interface ImageryInput {
  /** `props.image` / `props.src` — a real asset always wins. */
  explicit?: unknown;
  mode?: unknown;
  topic?: unknown;
  /** Which drawing to fall back to, and which shape of photo to ask for. */
  kind?: 'screenshot' | 'photo';
  /** Keeps two slots on the same page from drawing the same picture. */
  seed?: string;
  palette: PlaceholderPalette;
  /** Fallback topic when the block's props do not name one. */
  defaultTopic?: StockTopic;
  /** Rendered width, so a gallery tile does not pull a hero-sized file. */
  width?: number;
  /** Used when the source has nothing better — an explicit image, a drawing. */
  alt?: string;
}

export interface ResolvedImage {
  src: string;
  alt: string;
  /** Present only for a photograph, for a footer or an export note. */
  photo?: StockPhoto;
}

/**
 * The image a block should render, and the alt text that goes with it.
 *
 * Alt text travels with the photograph on purpose: "Painel de métricas em uma
 * tela" is true of the picture the CDN will serve, where the block's generic
 * "Product screenshot" is true only of the drawing it replaced.
 */
export function resolveImage(input: ImageryInput): ResolvedImage {
  const kind = input.kind ?? 'photo';
  const alt = input.alt ?? '';

  const explicit = typeof input.explicit === 'string' ? input.explicit.trim() : '';
  if (explicit) return { src: explicit, alt };

  if (toImageryMode(input.mode) === 'stock') {
    const topic = toStockTopic(input.topic, input.defaultTopic ?? defaultTopicFor(kind));
    const photo = pickStockPhoto(topic, input.seed ?? '');
    return {
      src: stockPhotoUrl(photo, { width: input.width ?? 1200 }),
      alt: photo.alt,
      photo,
    };
  }

  return {
    src:
      kind === 'screenshot'
        ? screenshotPlaceholder(input.palette)
        : photoPlaceholder(input.palette, input.seed ?? ''),
    alt,
  };
}

/**
 * `count` images for a grid, all different.
 *
 * Calling `resolveImage` once per tile would work for the placeholder — it is
 * seeded per position — but would hand the same photograph to several tiles,
 * because independent hashes over a small pool collide. The catalog's own
 * `pickStockPhotos` walks the pool instead.
 */
export function resolveImages(
  count: number,
  input: ImageryInput & { seeds?: string[]; alts?: string[] },
): ResolvedImage[] {
  const total = Math.max(0, Math.trunc(count));
  const seedAt = (index: number) => input.seeds?.[index] ?? `${input.seed ?? ''}-${index}`;
  const altAt = (index: number) => input.alts?.[index] ?? input.alt ?? '';

  if (toImageryMode(input.mode) === 'stock' && !isExplicit(input.explicit)) {
    const topic = toStockTopic(input.topic, input.defaultTopic ?? defaultTopicFor(input.kind));
    const photos = pickStockPhotos(topic, total, input.seed ?? '');
    return photos.map((photo) => ({
      src: stockPhotoUrl(photo, { width: input.width ?? 800 }),
      alt: photo.alt,
      photo,
    }));
  }

  return Array.from({ length: total }, (_, index) =>
    resolveImage({ ...input, seed: seedAt(index), alt: altAt(index) }),
  );
}

function isExplicit(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** A screenshot slot wants a screen in it; anything else is happier with a place. */
function defaultTopicFor(kind: ImageryInput['kind']): StockTopic {
  return kind === 'screenshot' ? 'product' : 'workspace';
}

export type { StockPhoto, StockTopic };
