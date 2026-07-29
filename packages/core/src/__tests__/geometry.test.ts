import { describe, expect, it } from 'vitest';
import {
  alignRects,
  canvasToScreen,
  distributeRects,
  fitToRect,
  resizeRect,
  screenToCanvas,
  snapRect,
  unionRects,
  zoomAt,
  type Rect,
} from '../geometry.js';

describe('viewport math', () => {
  it('round-trips screen <-> canvas coordinates', () => {
    const viewport = { offset: { x: 120, y: -40 }, zoom: 1.75 };
    const point = { x: 314, y: 159 };
    const back = canvasToScreen(screenToCanvas(point, viewport), viewport);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it('keeps the anchor point fixed while zooming', () => {
    const viewport = { offset: { x: 0, y: 0 }, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const before = screenToCanvas(anchor, viewport);
    const after = screenToCanvas(anchor, zoomAt(viewport, anchor, 2.5));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to the supported range', () => {
    const viewport = { offset: { x: 0, y: 0 }, zoom: 1 };
    expect(zoomAt(viewport, { x: 0, y: 0 }, 500).zoom).toBe(8);
    expect(zoomAt(viewport, { x: 0, y: 0 }, 0.0001).zoom).toBe(0.02);
  });

  it('fits a rect inside a container', () => {
    const viewport = fitToRect(
      { x: 0, y: 0, width: 1440, height: 900 },
      {
        width: 800,
        height: 600,
      },
    );
    expect(viewport.zoom).toBeLessThan(1);
    expect(viewport.zoom).toBeGreaterThan(0);
  });
});

describe('snapping', () => {
  const target: Rect = { x: 100, y: 100, width: 200, height: 100 };

  it('snaps a near-aligned left edge and reports a guide', () => {
    const moving: Rect = { x: 103, y: 400, width: 50, height: 50 };
    const result = snapRect(moving, [target], { threshold: 6 });
    expect(result.rect.x).toBe(100);
    expect(result.guides.some((g) => g.axis === 'x' && g.kind === 'edge')).toBe(true);
  });

  it('snaps centers', () => {
    const moving: Rect = { x: 172, y: 400, width: 50, height: 50 };
    const result = snapRect(moving, [target], { threshold: 8 });
    // target center-x is 200, moving center-x should land on it.
    expect(result.rect.x + 25).toBe(200);
    expect(result.guides.some((g) => g.kind === 'center')).toBe(true);
  });

  it('leaves distant rects untouched', () => {
    const moving: Rect = { x: 900, y: 900, width: 50, height: 50 };
    const result = snapRect(moving, [target], { threshold: 6 });
    expect(result.rect).toEqual(moving);
    expect(result.guides).toHaveLength(0);
  });

  it('falls back to grid snapping on unmatched axes', () => {
    const moving: Rect = { x: 903, y: 907, width: 50, height: 50 };
    const result = snapRect(moving, [target], { threshold: 6, grid: 8 });
    expect(result.rect.x % 8).toBe(0);
    expect(result.rect.y % 8).toBe(0);
  });
});

describe('align & distribute', () => {
  const rects: Rect[] = [
    { x: 0, y: 0, width: 100, height: 40 },
    { x: 50, y: 100, width: 60, height: 40 },
    { x: 200, y: 200, width: 80, height: 40 },
  ];

  it('aligns to the left of the shared bounds', () => {
    expect(alignRects(rects, 'left').every((p) => p.x === 0)).toBe(true);
  });

  it('centers horizontally within the shared bounds', () => {
    const bounds = unionRects(rects)!;
    const positions = alignRects(rects, 'center-x');
    positions.forEach((p, i) => {
      expect(p.x + rects[i]!.width / 2).toBeCloseTo(bounds.x + bounds.width / 2);
    });
  });

  it('distributes with equal gaps and pins the outer rects', () => {
    const positions = distributeRects(rects, 'x');
    expect(positions[0]!.x).toBe(0);
    expect(positions[2]!.x).toBe(200);

    const gapA = positions[1]!.x - (positions[0]!.x + rects[0]!.width);
    const gapB = positions[2]!.x - (positions[1]!.x + rects[1]!.width);
    expect(gapA).toBeCloseTo(gapB);
  });
});

describe('resize', () => {
  const rect: Rect = { x: 100, y: 100, width: 200, height: 100 };

  it('grows from the south-east handle', () => {
    expect(resizeRect(rect, 'se', { x: 50, y: 20 })).toEqual({
      x: 100,
      y: 100,
      width: 250,
      height: 120,
    });
  });

  it('moves the origin when dragging a north-west handle', () => {
    expect(resizeRect(rect, 'nw', { x: -20, y: -10 })).toEqual({
      x: 80,
      y: 90,
      width: 220,
      height: 110,
    });
  });

  it('preserves the aspect ratio when asked', () => {
    const result = resizeRect(rect, 'se', { x: 100, y: 0 }, { preserveAspect: true });
    expect(result.width / result.height).toBeCloseTo(rect.width / rect.height);
  });

  it('resizes symmetrically from the center', () => {
    const result = resizeRect(rect, 'e', { x: 20, y: 0 }, { fromCenter: true });
    expect(result.width).toBe(240);
    expect(result.x).toBe(80);
  });

  it('never shrinks below the minimum size', () => {
    const result = resizeRect(rect, 'se', { x: -1000, y: -1000 }, { minWidth: 8, minHeight: 8 });
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
  });
});
