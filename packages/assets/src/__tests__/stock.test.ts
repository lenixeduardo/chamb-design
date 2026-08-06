import { describe, expect, it } from 'vitest';
import {
  STOCK_PHOTOS,
  STOCK_TOPICS,
  pickStockPhoto,
  pickStockPhotos,
  stockCreditLine,
  stockPhotoUrl,
  stockPhotosFor,
  type StockTopic,
} from '../stock.js';

describe('the stock catalog', () => {
  it('gives every photo an id, an alt text and a credit', () => {
    for (const photo of STOCK_PHOTOS) {
      expect(photo.id, photo.id).toMatch(/^photo-[\w-]+$/);
      expect(photo.alt.length, photo.id).toBeGreaterThan(0);
      expect(photo.topics.length, photo.id).toBeGreaterThan(0);
      expect(photo.credit.sourceUrl, photo.id).toContain(photo.id);
      expect(photo.credit.license, photo.id).toBe('Unsplash');
    }
  });

  it('lists no photo twice', () => {
    expect(new Set(STOCK_PHOTOS.map((photo) => photo.id)).size).toBe(STOCK_PHOTOS.length);
  });

  /**
   * Three is the floor a gallery needs: below it, the default three-column
   * grid repeats a tile and the page reads as a rendering bug.
   */
  it.each(STOCK_TOPICS.map((topic) => [topic] as const))(
    'has at least three photos for %s',
    (topic) => {
      expect(stockPhotosFor(topic).length).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('stockPhotoUrl', () => {
  const photo = STOCK_PHOTOS[0]!;

  it('addresses the CDN directly, at the size asked for', () => {
    const url = new URL(stockPhotoUrl(photo, { width: 800, quality: 70 }));

    expect(url.origin).toBe('https://images.unsplash.com');
    expect(url.pathname).toBe(`/${photo.id}`);
    expect(url.searchParams.get('w')).toBe('800');
    expect(url.searchParams.get('q')).toBe('70');
    // `auto=format` is what lets one URL serve AVIF, WebP and JPEG.
    expect(url.searchParams.get('auto')).toBe('format');
  });

  it('needs no options, and no API key', () => {
    const url = stockPhotoUrl(photo);
    expect(url).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/);
    expect(url).not.toMatch(/client_id|access_key|token/i);
  });
});

describe('picking a photo', () => {
  it('is stable for a seed and varies across seeds', () => {
    expect(pickStockPhoto('workspace', 'landing').id).toBe(
      pickStockPhoto('workspace', 'landing').id,
    );

    const ids = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => pickStockPhoto('workspace', seed).id),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it('stays inside the topic it was asked for', () => {
    for (const topic of STOCK_TOPICS) {
      const photo = pickStockPhoto(topic, 'seed');
      expect(photo.topics, `${topic} → ${photo.id}`).toContain(topic);
    }
  });

  /**
   * Six is the largest grid a blueprint asks for (the portfolio wall), and no
   * topic has six photographs of its own — so this also covers the spill into
   * the rest of the catalog when a topic runs out.
   */
  it.each(STOCK_TOPICS.map((topic) => [topic] as const))(
    'fills a six-tile grid on %s without repeating a photo',
    (topic) => {
      const photos = pickStockPhotos(topic, 6, 'portfolio');
      expect(new Set(photos.map((photo) => photo.id)).size).toBe(6);
    },
  );

  it('spends the topic before reaching for anything else', () => {
    const pool = stockPhotosFor('food');
    const photos = pickStockPhotos('food', pool.length + 2, 'menu');

    expect(
      photos
        .slice(0, pool.length)
        .map((photo) => photo.id)
        .sort(),
    ).toEqual(pool.map((photo) => photo.id).sort());
    expect(photos).toHaveLength(pool.length + 2);
  });

  it('wraps only once the whole catalog is spent', () => {
    const photos = pickStockPhotos('team', STOCK_PHOTOS.length + 1, 'many');
    expect(photos[0]!.id).toBe(photos[STOCK_PHOTOS.length]!.id);
  });

  it('returns nothing for a count of zero', () => {
    expect(pickStockPhotos('team', 0, 'x')).toEqual([]);
  });

  /** An unknown topic is a typo somewhere, not a reason to render a hole. */
  it('falls back to the whole catalog for a topic nobody photographed', () => {
    const photo = pickStockPhoto('made-up' as StockTopic, 'seed');
    expect(STOCK_PHOTOS).toContain(photo);
  });
});

describe('stockCreditLine', () => {
  it('names the source even when the photographer is unknown', () => {
    const line = stockCreditLine(STOCK_PHOTOS[0]!);
    expect(line).toContain('Unsplash');
    expect(line).toContain(STOCK_PHOTOS[0]!.id);
  });

  it('names the photographer when the catalog knows one', () => {
    const photo = { ...STOCK_PHOTOS[0]!, credit: { ...STOCK_PHOTOS[0]!.credit, author: 'Ada L.' } };
    expect(stockCreditLine(photo)).toContain('Ada L.');
  });
});
