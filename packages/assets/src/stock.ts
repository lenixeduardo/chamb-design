/**
 * Free-licence stock photography.
 *
 * The block library already draws its own imagery — SVG placeholders built
 * from the project's tokens (`@opendesign/components`). Those are the right
 * answer for an offline document and the wrong answer for a page someone is
 * about to show a client: a template that opens on abstract gradients still
 * reads as a wireframe.
 *
 * This is the other half: a small curated catalog of Unsplash photographs,
 * addressed straight on the image CDN. Three properties matter:
 *
 *  - **No API key.** A photo id is a permanent path on `images.unsplash.com`,
 *    so building a page needs no account, no request and no network — the URL
 *    is assembled from data that ships with the package.
 *  - **No API call at build time.** Picking is a hash, not a search, so the
 *    same page always gets the same photograph and a rebuild produces a
 *    byte-identical document.
 *  - **Sized at the edge.** Unsplash's CDN takes `w`/`q`/`fit` parameters, so
 *    a hero asks for 1600px and a gallery tile for 800px rather than both
 *    pulling a 4000px original.
 *
 * The Unsplash Licence permits use, modification and redistribution without
 * permission or attribution; crediting is "appreciated but not required", so
 * `credit` carries what can be established from the id alone and
 * `stockCreditLine` renders it for anyone who wants to show it.
 */

export type StockTopic =
  'product' | 'workspace' | 'team' | 'retail' | 'craft' | 'food' | 'nature' | 'abstract';

export const STOCK_TOPICS: readonly StockTopic[] = [
  'product',
  'workspace',
  'team',
  'retail',
  'craft',
  'food',
  'nature',
  'abstract',
];

export interface StockCredit {
  license: 'Unsplash';
  /** The canonical file. Unsplash publishes no reverse lookup from it to a
   * photographer, so the author is filled in only where it is known — see
   * `scripts/verify-stock-catalog.mjs`, which checks the catalog against the
   * live CDN and can populate the field. */
  sourceUrl: string;
  author?: string;
  authorUrl?: string;
}

export interface StockPhoto {
  /** The CDN path segment, e.g. `photo-1551288049-bebda4e38f71`. */
  id: string;
  provider: 'unsplash';
  topics: StockTopic[];
  orientation: 'landscape' | 'portrait' | 'square';
  /** Alt text, in the language the templates are written in. */
  alt: string;
  credit: StockCredit;
}

const CDN = 'https://images.unsplash.com';

function photo(
  id: string,
  alt: string,
  topics: StockTopic[],
  orientation: StockPhoto['orientation'] = 'landscape',
): StockPhoto {
  return {
    id,
    provider: 'unsplash',
    topics,
    orientation,
    alt,
    credit: { license: 'Unsplash', sourceUrl: `${CDN}/${id}` },
  };
}

/**
 * The catalog.
 *
 * Curated rather than searched, and small on purpose: every topic needs enough
 * entries that a six-tile gallery does not repeat, and nothing beyond that.
 * Photographs are chosen for how they behave as *background* — room to crop,
 * no legible text, no recognisable faces filling the frame — because a block
 * decides the aspect ratio, not the photographer.
 */
export const STOCK_PHOTOS: readonly StockPhoto[] = [
  // product — screens, devices, things being used
  photo('photo-1551288049-bebda4e38f71', 'Painel de métricas em uma tela', [
    'product',
    'workspace',
  ]),
  photo('photo-1460925895917-afdab827c52f', 'Relatórios abertos sobre a mesa', ['product']),
  photo('photo-1517245386807-bb43f82c33c4', 'Notebook aberto em ambiente claro', [
    'product',
    'workspace',
  ]),
  photo('photo-1526498460520-4c246339dccb', 'Aplicativo aberto em um laptop', ['product']),
  photo('photo-1555421689-491a97ff2040', 'Gráficos em um monitor', ['product', 'abstract']),

  // workspace — desks, studios, rooms
  photo('photo-1497366754035-f200968a6e72', 'Escritório claro com mesas compartilhadas', [
    'workspace',
  ]),
  photo('photo-1524758631624-e2822e304c36', 'Sala de reunião com luz natural', ['workspace']),
  photo('photo-1497215728101-856f4ea42174', 'Estações de trabalho vazias ao entardecer', [
    'workspace',
  ]),
  photo('photo-1531973576160-7125cd663d86', 'Mesa de trabalho vista de cima', [
    'workspace',
    'craft',
  ]),

  // team — people working together
  photo('photo-1522071820081-009f0129c71c', 'Equipe reunida em volta de uma mesa', ['team']),
  photo('photo-1552664730-d307ca884978', 'Conversa de time durante um projeto', ['team']),
  photo('photo-1600880292203-757bb62b4baf', 'Duas pessoas revisando um trabalho', ['team']),
  photo('photo-1521737604893-d14cc237f11d', 'Time em uma sala de trabalho', ['team']),

  // retail — product on a shelf, packaging, shopping
  photo('photo-1441986300917-64674bd600d8', 'Vitrine de uma loja', ['retail']),
  photo('photo-1441984904996-e0b6ba687e04', 'Peças de roupa em uma arara', ['retail']),
  photo('photo-1472851294608-062f824d29cc', 'Balcão de atendimento de uma loja', ['retail']),
  photo('photo-1528698827591-e19ccd7bc23d', 'Produto embalado sobre a bancada', [
    'retail',
    'craft',
  ]),

  // craft — making things, portfolios, studios
  photo('photo-1452860606245-08befc0ff44b', 'Materiais de projeto sobre a mesa', ['craft']),
  photo('photo-1499750310107-5fef28a66643', 'Caderno aberto ao lado de um café', [
    'craft',
    'workspace',
  ]),
  photo('photo-1503602642458-232111445657', 'Estúdio de trabalho manual', ['craft']),

  // food
  photo('photo-1504674900247-0877df9cc836', 'Prato servido sobre a mesa', ['food']),
  photo('photo-1498837167922-ddd27525d352', 'Ingredientes frescos preparados', ['food']),
  photo('photo-1414235077428-338989a2e8c0', 'Salão de um restaurante', ['food', 'retail']),

  // nature
  photo('photo-1501785888041-af3ef285b470', 'Lago entre montanhas', ['nature']),
  photo('photo-1470071459604-3b5ec3a7fe05', 'Névoa sobre a floresta', ['nature']),
  photo('photo-1439853949127-fa647821eba0', 'Costa vista do alto', ['nature']),

  // abstract — texture and colour, for when a literal subject would lie
  photo('photo-1550859492-d5da9d8e45f3', 'Superfície colorida em gradiente', ['abstract']),
  photo('photo-1557683316-973673baf926', 'Textura suave em tons frios', ['abstract']),
  photo('photo-1614850523459-c2f4c699c52e', 'Composição geométrica em cores quentes', ['abstract']),
];

export interface StockPhotoUrlOptions {
  /** Rendered width in CSS pixels; the CDN resizes at the edge. */
  width?: number;
  height?: number;
  /** 1–100. 80 is the point where JPEG artefacts stop being visible. */
  quality?: number;
  fit?: 'crop' | 'max';
}

/**
 * The CDN URL for a photo at the size a block actually needs.
 *
 * `auto=format` is what makes this cheap: the CDN serves AVIF or WebP to
 * browsers that accept them and JPEG to the rest, from the same URL.
 */
export function stockPhotoUrl(photo: StockPhoto, options: StockPhotoUrlOptions = {}): string {
  const params = new URLSearchParams({
    auto: 'format',
    fit: options.fit ?? 'crop',
    w: String(Math.round(options.width ?? 1200)),
    q: String(Math.round(options.quality ?? 80)),
  });
  if (options.height) params.set('h', String(Math.round(options.height)));
  return `${CDN}/${photo.id}?${params.toString()}`;
}

/** Every photo carrying a topic, in catalog order. */
export function stockPhotosFor(topic: StockTopic): StockPhoto[] {
  return STOCK_PHOTOS.filter((entry) => entry.topics.includes(topic));
}

/**
 * One photo for a topic, chosen by seed.
 *
 * Seeded rather than random so a document is reproducible: rebuilding the same
 * template twice has to produce the same file, or every regeneration shows up
 * as a diff.
 */
export function pickStockPhoto(topic: StockTopic, seed = ''): StockPhoto {
  const pool = stockPhotosFor(topic);
  const source = pool.length > 0 ? pool : STOCK_PHOTOS;
  return source[hash(`${topic}:${seed}`) % source.length]!;
}

/**
 * `count` photos for a topic, all different.
 *
 * Two things would produce a repeat, and both are ruled out here. Hashing each
 * position on its own collides over a small pool, so this walks the pool from
 * one seeded offset. And a six-tile gallery on a topic with four photographs
 * would run out, so the walk continues into the rest of the catalog rather
 * than starting the same four again: a slightly off-topic picture is a much
 * smaller error than the same picture twice on one screen.
 */
export function pickStockPhotos(topic: StockTopic, count: number, seed = ''): StockPhoto[] {
  const total = Math.max(0, Math.trunc(count));
  const preferred = stockPhotosFor(topic);
  const rest = STOCK_PHOTOS.filter((entry) => !preferred.includes(entry));
  const ordered = [...rotate(preferred, `${topic}:${seed}`), ...rotate(rest, `${topic}:${seed}`)];

  return Array.from({ length: total }, (_, index) => ordered[index % ordered.length]!);
}

/** The same list, starting at a seeded position. */
function rotate(photos: StockPhoto[], seed: string): StockPhoto[] {
  if (photos.length === 0) return [];
  const offset = hash(seed) % photos.length;
  return photos.map((_, index) => photos[(offset + index) % photos.length]!);
}

/** A one-line credit, for a footer or an export README. */
export function stockCreditLine(photo: StockPhoto): string {
  return photo.credit.author
    ? `Foto: ${photo.credit.author} — Unsplash (${photo.credit.sourceUrl})`
    : `Foto: Unsplash (${photo.credit.sourceUrl})`;
}

/** Small, stable, non-cryptographic — it only has to spread the choices. */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}
