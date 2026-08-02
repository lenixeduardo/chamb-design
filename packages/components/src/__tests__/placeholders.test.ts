import { describe, expect, it } from 'vitest';
import { defaultTokens, type TokenSet } from '@opendesign/core';
import { BUILTIN_COMPONENTS } from '../index.js';
import {
  avatarPlaceholder,
  paletteFromTokens,
  photoPlaceholder,
  screenshotPlaceholder,
} from '../placeholders.js';

function decode(dataUri: string): string {
  expect(dataUri.startsWith('data:image/svg+xml;base64,')).toBe(true);
  return Buffer.from(dataUri.split(',')[1]!, 'base64').toString('utf8');
}

function makeCreateId() {
  let counter = 0;
  return () => `n_${(counter += 1)}`;
}

describe('paletteFromTokens', () => {
  it('reads the semantic colours a placeholder needs', () => {
    const tokens = defaultTokens();
    const palette = paletteFromTokens(tokens);

    expect(palette.accent).toBe(tokens.color.accent);
    expect(palette.background).toBe(tokens.color.background);
  });

  it('falls back rather than emitting an empty colour', () => {
    const palette = paletteFromTokens({ color: {} } as unknown as TokenSet);
    expect(palette.accent).toMatch(/^#/);
    expect(paletteFromTokens(undefined).background).toMatch(/^#/);
  });
});

describe('placeholder images', () => {
  /**
   * Base64, not percent-encoding: every colour here contains `#`, which is a
   * fragment delimiter in a plain data URI and truncates the image silently.
   */
  it('encodes as base64 so hex colours survive', () => {
    const svg = decode(screenshotPlaceholder(paletteFromTokens(defaultTokens())));
    expect(svg).toContain('<svg');
    expect(svg).toContain(defaultTokens().color.accent as string);
  });

  it('wears the project palette rather than a fixed one', () => {
    const custom = paletteFromTokens({
      color: {
        accent: '#ff0000',
        background: '#ffffff',
        muted: '#eeeeee',
        border: '#dddddd',
        foreground: '#000000',
      },
    } as unknown as TokenSet);

    expect(decode(screenshotPlaceholder(custom))).toContain('#ff0000');
    // Alpha versions come out as rgba, so the raw channels have to be there.
    expect(decode(photoPlaceholder(custom, 'a'))).toContain('rgba(255, 0, 0');
  });

  it('varies by seed, so a grid is not one tile repeated', () => {
    const palette = paletteFromTokens(defaultTokens());
    expect(photoPlaceholder(palette, 'one')).not.toBe(photoPlaceholder(palette, 'two'));
    expect(photoPlaceholder(palette, 'one')).toBe(photoPlaceholder(palette, 'one'));
  });

  it('draws initials, escaped', () => {
    const palette = paletteFromTokens(defaultTokens());
    expect(decode(avatarPlaceholder('Ana Ribeiro', palette))).toContain('>AR<');
    expect(decode(avatarPlaceholder('<script>', palette))).not.toContain('<script>');
  });

  it('stays small enough to inline in a document', () => {
    const palette = paletteFromTokens(defaultTokens());
    for (const uri of [
      screenshotPlaceholder(palette),
      photoPlaceholder(palette, 'x'),
      avatarPlaceholder('Ana Ribeiro', palette),
    ]) {
      expect(uri.length).toBeLessThan(3000);
    }
  });
});

describe('blocks that carry imagery', () => {
  const blocks = new Map(BUILTIN_COMPONENTS.map((component) => [component.id, component]));

  const build = (id: string, props?: Record<string, unknown>) =>
    blocks.get(id)!.create({
      createId: makeCreateId(),
      tokens: defaultTokens(),
      ...(props ? { props } : {}),
    });

  /** An empty visual slot is this block's default state; it must not look broken. */
  it('gives the split hero a visual without being asked', () => {
    const image = build('lib:hero-split').nodes.find((node) => node.type === 'image');
    expect(String(image?.props.src)).toContain('data:image/svg+xml');
  });

  it('lets a real image win over the placeholder', () => {
    const image = build('lib:hero-split', { image: 'https://example.com/shot.png' }).nodes.find(
      (node) => node.type === 'image',
    );
    expect(image?.props.src).toBe('https://example.com/shot.png');
  });

  it('gives every testimonial a portrait', () => {
    const images = build('lib:testimonials').nodes.filter((node) => node.type === 'image');
    expect(images).toHaveLength(3);
    expect(new Set(images.map((node) => node.props.src)).size).toBe(3);
  });

  it('builds a gallery with one image per caption', () => {
    const { nodes } = build('lib:gallery', { items: 'Um,Dois,Três,Quatro', columns: 4 });
    const images = nodes.filter((node) => node.type === 'image');

    expect(images).toHaveLength(4);
    expect(images.map((node) => node.props.alt)).toEqual(['Um', 'Dois', 'Três', 'Quatro']);
    expect(new Set(images.map((node) => node.props.src)).size).toBe(4);
  });
});
