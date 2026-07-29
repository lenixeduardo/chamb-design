import type { MotionKeyframe, MotionSpec, SceneNode } from '@opendesign/core';

/**
 * Motion without a runtime dependency.
 *
 * The renderer expresses animations as CSS custom properties plus data
 * attributes. A tiny stylesheet (`motionStylesheet()`) turns those into real
 * animations, so the canvas animates with zero JS. Hosts that want
 * Framer Motion or GSAP read the same `node.motion` spec and take over — the
 * document never encodes an engine-specific format.
 */

function keyframeToTransform(frame: MotionKeyframe | undefined): string {
  if (!frame) return 'none';
  const parts: string[] = [];
  if (frame.x !== undefined) parts.push(`translateX(${frame.x}px)`);
  if (frame.y !== undefined) parts.push(`translateY(${frame.y}px)`);
  if (frame.scale !== undefined) parts.push(`scale(${frame.scale})`);
  if (frame.rotate !== undefined) parts.push(`rotate(${frame.rotate}deg)`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function motionAttributes(node: SceneNode): Record<string, unknown> {
  const motion = node.motion;
  if (!motion) return {};

  const style: Record<string, string> = {
    '--od-motion-duration': `${motion.duration ?? 400}ms`,
    '--od-motion-delay': `${motion.delay ?? 0}ms`,
    '--od-motion-ease': motion.ease ?? 'cubic-bezier(0.16, 1, 0.3, 1)',
    '--od-motion-from-opacity': String(motion.from?.opacity ?? 0),
    '--od-motion-to-opacity': String(motion.to?.opacity ?? 1),
    '--od-motion-from-transform': keyframeToTransform(motion.from),
    '--od-motion-to-transform': keyframeToTransform(motion.to),
  };

  if (motion.from?.blur !== undefined) style['--od-motion-from-blur'] = `blur(${motion.from.blur}px)`;
  if (motion.stagger !== undefined) style['--od-motion-stagger'] = `${motion.stagger}ms`;

  return {
    'data-od-motion': motion.trigger,
    'data-od-motion-engine': motion.engine,
    style,
  };
}

/**
 * The stylesheet backing `data-od-motion`.
 *
 * Injected once by the host app. `prefers-reduced-motion` is honoured here, in
 * one place, rather than being every block author's problem.
 */
export function motionStylesheet(): string {
  return `
@keyframes od-motion-enter {
  from {
    opacity: var(--od-motion-from-opacity, 0);
    transform: var(--od-motion-from-transform, none);
    filter: var(--od-motion-from-blur, none);
  }
  to {
    opacity: var(--od-motion-to-opacity, 1);
    transform: var(--od-motion-to-transform, none);
    filter: none;
  }
}

[data-od-motion='mount'],
[data-od-motion='in-view'] {
  animation: od-motion-enter var(--od-motion-duration, 400ms) var(--od-motion-ease, ease-out)
    var(--od-motion-delay, 0ms) both;
}

[data-od-motion='in-view']:not([data-od-in-view='true']) {
  animation-play-state: paused;
}

[data-od-motion='hover'] {
  transition: transform var(--od-motion-duration, 240ms) var(--od-motion-ease, ease-out),
    opacity var(--od-motion-duration, 240ms) var(--od-motion-ease, ease-out);
}

[data-od-motion='hover']:hover {
  transform: var(--od-motion-to-transform, none);
  opacity: var(--od-motion-to-opacity, 1);
}

[data-od-motion='tap']:active {
  transform: var(--od-motion-to-transform, scale(0.97));
}

@media (prefers-reduced-motion: reduce) {
  [data-od-motion] {
    animation: none !important;
    transition: none !important;
    transform: none !important;
    opacity: 1 !important;
  }
}
`.trim();
}

/** Presets the AI layer and the motion panel offer as starting points. */
export const MOTION_PRESETS: Record<string, MotionSpec> = {
  fadeIn: {
    engine: 'css',
    trigger: 'mount',
    from: { opacity: 0 },
    to: { opacity: 1 },
    duration: 400,
  },
  fadeUp: {
    engine: 'css',
    trigger: 'in-view',
    from: { opacity: 0, y: 24 },
    to: { opacity: 1, y: 0 },
    duration: 600,
    ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  scaleIn: {
    engine: 'css',
    trigger: 'mount',
    from: { opacity: 0, scale: 0.96 },
    to: { opacity: 1, scale: 1 },
    duration: 400,
  },
  hoverLift: {
    engine: 'css',
    trigger: 'hover',
    to: { y: -4 },
    duration: 240,
  },
  tapPress: {
    engine: 'css',
    trigger: 'tap',
    to: { scale: 0.97 },
    duration: 120,
  },
  staggerChildren: {
    engine: 'framer-motion',
    trigger: 'in-view',
    from: { opacity: 0, y: 16 },
    to: { opacity: 1, y: 0 },
    duration: 500,
    stagger: 80,
  },
};
