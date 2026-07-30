import { walk, type DesignDocument, type MotionSpec, type NodeId } from '@opendesign/core';

/**
 * Turning a design's motion metadata into a timeline.
 *
 * The document already carries `MotionSpec` on nodes — durations, delays,
 * stagger, from/to keyframes — because the CSS engine needs it. Nothing was
 * reading it as *time*, though, so this is the piece that maps it onto frames.
 *
 * Deliberately pure and Remotion-free: the interpolation is the part most likely
 * to be wrong, and it is far easier to test as arithmetic than through a video
 * renderer.
 */

export interface FrameState {
  opacity: number;
  transform: string;
  filter?: string;
}

export interface TimelineEntry {
  nodeId: NodeId;
  spec: MotionSpec;
  /** Frame the animation starts on, after delay and stagger. */
  startFrame: number;
  durationInFrames: number;
}

export interface TimelineOptions {
  fps?: number;
  /** Extra frames held after the last animation ends. */
  tailFrames?: number;
  /** Frames before anything starts, so a video does not open mid-motion. */
  leadFrames?: number;
}

const DEFAULT_DURATION = 400;

/**
 * `cubic-bezier(0.16, 1, 0.3, 1)` — the ease used across the block library.
 *
 * Solved by bisection rather than a closed form: cubic beziers have no
 * algebraic inverse, and 12 iterations lands well inside a pixel at any
 * realistic duration.
 */
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const curve = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    let low = 0;
    let high = 1;
    let mid = x;

    for (let i = 0; i < 12; i += 1) {
      mid = (low + high) / 2;
      if (curve(x1, x2, mid) < x) low = mid;
      else high = mid;
    }

    return curve(y1, y2, mid);
  };
}

const EASINGS: Record<string, (t: number) => number> = {
  linear: (t) => t,
  ease: cubicBezier(0.25, 0.1, 0.25, 1),
  'ease-in': cubicBezier(0.42, 0, 1, 1),
  'ease-out': cubicBezier(0, 0, 0.58, 1),
  'ease-in-out': cubicBezier(0.42, 0, 0.58, 1),
};

export function resolveEasing(ease: string | undefined): (t: number) => number {
  if (!ease) return cubicBezier(0.16, 1, 0.3, 1);

  const named = EASINGS[ease.trim()];
  if (named) return named;

  const match =
    /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(ease);
  if (match) {
    return cubicBezier(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]));
  }

  // Unknown easing keyword: fall back rather than throw. A video that renders
  // with the wrong curve beats a build that fails on a typo in a CSS string.
  return cubicBezier(0.16, 1, 0.3, 1);
}

/**
 * Duration in frames. Floors at 1: a 5ms animation still occupies a frame, and
 * zero would divide by zero during interpolation.
 */
export function msToFrames(ms: number, fps: number): number {
  return Math.max(Math.round((ms / 1000) * fps), 1);
}

/**
 * Offset in frames. Floors at 0, unlike `msToFrames`.
 *
 * The distinction matters: a delay of 0 must mean frame 0, so reusing the
 * duration conversion here would push every un-delayed animation a frame late —
 * and the error compounds with stagger, where each item adds another offset.
 */
export function msToFrameOffset(ms: number, fps: number): number {
  return Math.max(Math.round((ms / 1000) * fps), 0);
}

/**
 * Builds the timeline for a page.
 *
 * Only `mount` and `in-view` triggers get a slot: `hover` and `tap` are
 * interactions, and there is no cursor in a rendered video. Emitting them would
 * produce elements that animate for no visible reason.
 */
export function buildTimeline(
  document: DesignDocument,
  rootId: NodeId,
  options: TimelineOptions = {},
): { entries: TimelineEntry[]; durationInFrames: number; fps: number } {
  const fps = options.fps ?? 30;
  const leadFrames = options.leadFrames ?? Math.round(fps * 0.25);
  const tailFrames = options.tailFrames ?? Math.round(fps * 1.5);

  const entries: TimelineEntry[] = [];
  let order = 0;

  walk(document, rootId, (node) => {
    if (node.hidden) return false;

    const spec = node.motion;
    if (!spec) return true;
    if (spec.trigger !== 'mount' && spec.trigger !== 'in-view') return true;

    const delay = spec.delay ?? 0;
    // `stagger` is per-item; in a document the index is the walk order, which
    // matches the visual order because the walk is depth-first.
    const stagger = (spec.stagger ?? 0) * order;

    entries.push({
      nodeId: node.id,
      spec,
      startFrame: leadFrames + msToFrameOffset(delay + stagger, fps),
      durationInFrames: msToFrames(spec.duration ?? DEFAULT_DURATION, fps),
    });

    order += 1;
    return true;
  });

  const lastFrame = entries.reduce(
    (max, entry) => Math.max(max, entry.startFrame + entry.durationInFrames),
    leadFrames,
  );

  return { entries, durationInFrames: lastFrame + tailFrames, fps };
}

/**
 * The visual state of one animated node at a given frame.
 *
 * Returns the *rest* state before the entry starts and after it ends, so a node
 * is never left mid-interpolation at the edges of the video.
 */
export function motionAtFrame(entry: TimelineEntry, frame: number): FrameState {
  const { spec, startFrame, durationInFrames } = entry;

  const from = spec.from ?? {};
  const to = spec.to ?? {};

  const rest = (keyframe: typeof from): FrameState => ({
    opacity: keyframe.opacity ?? 1,
    transform: buildTransform(keyframe),
    ...(keyframe.blur !== undefined ? { filter: `blur(${keyframe.blur}px)` } : {}),
  });

  if (frame < startFrame) return rest(from);
  if (frame >= startFrame + durationInFrames) return rest(to);

  const progress = (frame - startFrame) / durationInFrames;
  const eased = resolveEasing(spec.ease)(progress);

  const lerp = (a: number | undefined, b: number | undefined, fallback: number) => {
    const start = a ?? fallback;
    const end = b ?? fallback;
    return start + (end - start) * eased;
  };

  const state: FrameState = {
    opacity: lerp(from.opacity, to.opacity, 1),
    transform: buildTransform({
      x: lerp(from.x, to.x, 0),
      y: lerp(from.y, to.y, 0),
      scale: lerp(from.scale, to.scale, 1),
      rotate: lerp(from.rotate, to.rotate, 0),
    }),
  };

  if (from.blur !== undefined || to.blur !== undefined) {
    state.filter = `blur(${lerp(from.blur, to.blur, 0)}px)`;
  }

  return state;
}

function buildTransform(keyframe: {
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
}): string {
  const parts: string[] = [];

  if (keyframe.x) parts.push(`translateX(${round(keyframe.x)}px)`);
  if (keyframe.y) parts.push(`translateY(${round(keyframe.y)}px)`);
  if (keyframe.scale !== undefined && keyframe.scale !== 1)
    parts.push(`scale(${round(keyframe.scale)})`);
  if (keyframe.rotate) parts.push(`rotate(${round(keyframe.rotate)}deg)`);

  return parts.length > 0 ? parts.join(' ') : 'none';
}

/** Three decimals: enough for sub-pixel motion, short enough to keep CSS readable. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Frame states for every animated node, keyed by node id. */
export function frameStates(entries: TimelineEntry[], frame: number): Record<NodeId, FrameState> {
  const out: Record<NodeId, FrameState> = {};
  for (const entry of entries) out[entry.nodeId] = motionAtFrame(entry, frame);
  return out;
}
