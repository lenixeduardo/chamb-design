/**
 * Canvas math: rectangles, snapping, alignment guides and distribution.
 *
 * Kept free of DOM and React so the same code drives the browser canvas, the
 * headless layout tests and any future native surface.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  /** Canvas-space coordinate shown at the top-left of the screen. */
  offset: Point;
  zoom: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;

export function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

export function screenToCanvas(point: Point, viewport: Viewport): Point {
  return {
    x: point.x / viewport.zoom + viewport.offset.x,
    y: point.y / viewport.zoom + viewport.offset.y,
  };
}

export function canvasToScreen(point: Point, viewport: Viewport): Point {
  return {
    x: (point.x - viewport.offset.x) * viewport.zoom,
    y: (point.y - viewport.offset.y) * viewport.zoom,
  };
}

/** Zooms around a fixed screen anchor, the way every design tool behaves. */
export function zoomAt(viewport: Viewport, anchor: Point, nextZoom: number): Viewport {
  const zoom = clampZoom(nextZoom);
  const before = screenToCanvas(anchor, viewport);
  const after = screenToCanvas(anchor, { ...viewport, zoom });
  return {
    zoom,
    offset: {
      x: viewport.offset.x + (before.x - after.x),
      y: viewport.offset.y + (before.y - after.y),
    },
  };
}

/** Viewport that fits `bounds` in a `container`-sized screen, with padding. */
export function fitToRect(
  bounds: Rect,
  container: { width: number; height: number },
  padding = 64,
): Viewport {
  const availableWidth = Math.max(container.width - padding * 2, 1);
  const availableHeight = Math.max(container.height - padding * 2, 1);
  const zoom = clampZoom(
    Math.min(
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1),
    ),
  );
  return {
    zoom,
    offset: {
      x: bounds.x + bounds.width / 2 - container.width / 2 / zoom,
      y: bounds.y + bounds.height / 2 - container.height / 2 / zoom,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                Rect helpers                                */
/* -------------------------------------------------------------------------- */

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectIntersects(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Normalizes a drag rectangle so width/height are never negative. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Snapping                                  */
/* -------------------------------------------------------------------------- */

export type GuideAxis = 'x' | 'y';

export interface SnapGuide {
  axis: GuideAxis;
  /** Canvas coordinate of the guide line. */
  position: number;
  /** Perpendicular extent, so the UI can draw a line spanning both rects. */
  start: number;
  end: number;
  kind: 'edge' | 'center' | 'spacing';
}

export interface SnapResult {
  rect: Rect;
  delta: Point;
  guides: SnapGuide[];
}

export interface SnapOptions {
  /** Max distance in canvas units that still snaps. Scale by 1/zoom. */
  threshold?: number;
  /** When set, positions also snap to this grid. */
  grid?: number;
}

/**
 * Snaps `moving` against `targets`, matching left/center/right and
 * top/middle/bottom edges — the six alignments users actually expect.
 */
export function snapRect(moving: Rect, targets: Rect[], options: SnapOptions = {}): SnapResult {
  const threshold = options.threshold ?? 6;
  const guides: SnapGuide[] = [];

  const movingX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const movingY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];

  let bestX: { delta: number; guide: SnapGuide } | null = null;
  let bestY: { delta: number; guide: SnapGuide } | null = null;

  for (const target of targets) {
    const targetX = [target.x, target.x + target.width / 2, target.x + target.width];
    const targetY = [target.y, target.y + target.height / 2, target.y + target.height];

    for (const [mi, m] of movingX.entries()) {
      for (const [ti, t] of targetX.entries()) {
        const distance = t - m;
        if (Math.abs(distance) > threshold) continue;
        if (bestX && Math.abs(distance) >= Math.abs(bestX.delta)) continue;
        bestX = {
          delta: distance,
          guide: {
            axis: 'x',
            position: t,
            start: Math.min(moving.y, target.y),
            end: Math.max(moving.y + moving.height, target.y + target.height),
            kind: mi === 1 && ti === 1 ? 'center' : 'edge',
          },
        };
      }
    }

    for (const [mi, m] of movingY.entries()) {
      for (const [ti, t] of targetY.entries()) {
        const distance = t - m;
        if (Math.abs(distance) > threshold) continue;
        if (bestY && Math.abs(distance) >= Math.abs(bestY.delta)) continue;
        bestY = {
          delta: distance,
          guide: {
            axis: 'y',
            position: t,
            start: Math.min(moving.x, target.x),
            end: Math.max(moving.x + moving.width, target.x + target.width),
            kind: mi === 1 && ti === 1 ? 'center' : 'edge',
          },
        };
      }
    }
  }

  let dx = bestX?.delta ?? 0;
  let dy = bestY?.delta ?? 0;

  // Grid snapping only kicks in where no object snap won.
  if (options.grid && options.grid > 0) {
    if (!bestX) dx = Math.round(moving.x / options.grid) * options.grid - moving.x;
    if (!bestY) dy = Math.round(moving.y / options.grid) * options.grid - moving.y;
  }

  if (bestX) guides.push(bestX.guide);
  if (bestY) guides.push(bestY.guide);

  return {
    rect: { ...moving, x: moving.x + dx, y: moving.y + dy },
    delta: { x: dx, y: dy },
    guides,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Alignment & distribution                          */
/* -------------------------------------------------------------------------- */

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

/** Returns the new position for each rect, aligned within their shared bounds. */
export function alignRects(rects: Rect[], mode: AlignMode): Point[] {
  const bounds = unionRects(rects);
  if (!bounds) return [];

  return rects.map((rect) => {
    switch (mode) {
      case 'left':
        return { x: bounds.x, y: rect.y };
      case 'center-x':
        return { x: bounds.x + (bounds.width - rect.width) / 2, y: rect.y };
      case 'right':
        return { x: bounds.x + bounds.width - rect.width, y: rect.y };
      case 'top':
        return { x: rect.x, y: bounds.y };
      case 'center-y':
        return { x: rect.x, y: bounds.y + (bounds.height - rect.height) / 2 };
      case 'bottom':
        return { x: rect.x, y: bounds.y + bounds.height - rect.height };
    }
  });
}

/** Evenly spreads rects along an axis, keeping the outermost two fixed. */
export function distributeRects(rects: Rect[], axis: GuideAxis): Point[] {
  if (rects.length < 3) return rects.map((r) => ({ x: r.x, y: r.y }));

  const indexed = rects.map((rect, index) => ({ rect, index }));
  const size = axis === 'x' ? ('width' as const) : ('height' as const);
  indexed.sort((a, b) => a.rect[axis] - b.rect[axis]);

  const first = indexed[0]!.rect;
  const last = indexed[indexed.length - 1]!.rect;
  const span = last[axis] + last[size] - first[axis];
  const occupied = indexed.reduce((sum, item) => sum + item.rect[size], 0);
  const gap = (span - occupied) / (indexed.length - 1);

  const result: Point[] = new Array(rects.length);
  let cursor = first[axis];

  for (const { rect, index } of indexed) {
    result[index] = axis === 'x' ? { x: cursor, y: rect.y } : { x: rect.x, y: cursor };
    cursor += rect[size] + gap;
  }

  return result;
}

/** Resize handles, in the order the UI draws them. */
export const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

export interface ResizeOptions {
  /** Locks the aspect ratio (shift-drag). */
  preserveAspect?: boolean;
  /** Resizes symmetrically around the center (alt-drag). */
  fromCenter?: boolean;
  minWidth?: number;
  minHeight?: number;
}

export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  delta: Point,
  options: ResizeOptions = {},
): Rect {
  const minWidth = options.minWidth ?? 1;
  const minHeight = options.minHeight ?? 1;
  const aspect = rect.height === 0 ? 1 : rect.width / rect.height;

  let { x, y, width, height } = rect;
  const scale = options.fromCenter ? 2 : 1;

  if (handle.includes('e')) width += delta.x * scale;
  if (handle.includes('w')) {
    width -= delta.x * scale;
    if (!options.fromCenter) x += delta.x;
  }
  if (handle.includes('s')) height += delta.y * scale;
  if (handle.includes('n')) {
    height -= delta.y * scale;
    if (!options.fromCenter) y += delta.y;
  }

  if (options.preserveAspect) {
    if (handle === 'n' || handle === 's') width = height * aspect;
    else height = width / aspect;
  }

  width = Math.max(width, minWidth);
  height = Math.max(height, minHeight);

  if (options.fromCenter) {
    x = rect.x + rect.width / 2 - width / 2;
    y = rect.y + rect.height / 2 - height / 2;
  }

  return { x, y, width, height };
}
