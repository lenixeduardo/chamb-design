# Animation in Remotion

Everything here comes back to one idea: an animated value is a function of the frame number.
Pick the function, don't manage state.

## Contents

- [interpolate()](#interpolate) — mapping ranges, clamping, easing
- [spring()](#spring) — physics-based motion
- [Choosing between them](#choosing-between-interpolate-and-spring)
- [Staggering and looping](#staggering-and-looping)
- [Transitions between scenes](#transitions-between-scenes)
- [Freeze, Loop, and time manipulation](#freeze-loop-and-time-manipulation)
- [Patterns worth copying](#patterns-worth-copying)

## interpolate()

`interpolate(input, inputRange, outputRange, options?)` maps one range onto another.

```tsx
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { durationInFrames } = useVideoConfig();

// Fade in over 20 frames, hold, fade out over the last 20.
const opacity = interpolate(frame, [0, 20, durationInFrames - 20, durationInFrames], [0, 1, 1, 0]);
```

`inputRange` and `outputRange` must be the same length. Multiple keyframes are allowed and
often clearer than chaining several calls.

### Options

**`extrapolateLeft` / `extrapolateRight`** (default `'extend'`). Controls behaviour outside
the input range:

| Value        | Behaviour                                                                       |
| ------------ | ------------------------------------------------------------------------------- |
| `'extend'`   | Keeps interpolating past the range — the default, and usually not what you want |
| `'clamp'`    | Returns the nearest value inside the output range                               |
| `'wrap'`     | Loops the value                                                                 |
| `'identity'` | Returns the input unchanged                                                     |

```tsx
interpolate(1.5, [0, 1], [0, 2], { extrapolateRight: 'extend' }); // 3
interpolate(1.5, [0, 1], [0, 2], { extrapolateRight: 'clamp' }); // 2
interpolate(1.5, [0, 1], [0, 2], { extrapolateRight: 'identity' }); // 1.5
interpolate(1.5, [0, 1], [0, 2], { extrapolateRight: 'wrap' }); // 1
```

Default to clamping both ends. An unclamped opacity keeps rising above 1 (harmless) or falls
below 0 (element disappears), and an unclamped scale grows without bound — bugs that only
appear in the tail of the video, long after the part you were watching.

**`easing`** (default linear). A single function eases the progress inside the active
segment:

```tsx
import { Easing, interpolate } from 'remotion';

interpolate(frame, [0, 100], [0, 1], {
  easing: Easing.bezier(0.8, 0.22, 0.96, 0.65),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

`Easing` provides `linear`, `ease`, `quad`, `cubic`, `poly(n)`, `sin`, `circle`, `exp`,
`bounce`, `elastic(bounciness)`, `back(s)`, `bezier(x1,y1,x2,y2)`, `step0`, `step1`, plus the
modifiers `Easing.in()`, `Easing.out()`, and `Easing.inOut()`. `Easing.out(Easing.cubic)` is
a good default for UI-feeling motion — fast start, soft landing.

From 4.0.462 you can pass an **array** of easings, one per segment, with length
`inputRange.length - 1`:

```tsx
interpolate(frame, [0, 100, 200], [0, 1, 2], {
  easing: [Easing.out(Easing.cubic), Easing.in(Easing.cubic)],
});
```

**`output: 'perceptual-scale'`** (from 4.0.490). For `scale`, a linear change in the CSS
number is not a linear change in visible area — area grows with `scale ** 2`, which reads as
accelerating even with linear timing. This option interpolates the signed area instead:

```tsx
const scale = interpolate(frame, [0, 60], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  output: 'perceptual-scale',
});
```

At halfway this returns `Math.sqrt(0.5)`, not `0.5`. Reach for it when a zoom feels wrong
despite correct easing.

**`posterize: n`** (from 4.0.470). Quantizes the input before interpolating, so the value
only updates every `n` frames. With `posterize: 3`, frames 0–2 share frame 0's value. This is
how you get a deliberate stop-motion or low-framerate look without changing `fps`.

### Interpolating strings and tuples

`outputRange` accepts CSS transform strings (from 4.0.472) — `scale`, `translate`, `rotate`,
`transformOrigin`:

```tsx
<div
  style={{
    scale: interpolate(frame, [0, 30], ['1', '2 3']),
    translate: interpolate(frame, [0, 30], ['0px 0px', '100px 50px']),
    rotate: interpolate(frame, [0, 30], ['0deg', '90deg']),
  }}
/>
```

All values in one interpolation must be the same type, and units must match per component.
Numeric tuples also work (from 4.0.473): `interpolate(frame, [0, 60], [[0, 0.5], [1, 0.5]])`.

For colours, use `interpolateColors(frame, [0, 30], ['#fff', '#000'])`, which interpolates in
RGBA rather than lexically.

## spring()

A physics simulation. It animates from `0` to `1` by default and overshoots slightly, which
is what makes it feel alive:

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const driver = spring({ frame, fps, config: { damping: 200 } });
```

Always pass the real `fps` — the simulation is time-based, so a wrong `fps` changes the feel.

| Parameter                  | Default   | Effect                                               |
| -------------------------- | --------- | ---------------------------------------------------- |
| `frame`                    | —         | Pass `useCurrentFrame()`; use `frame - 20` to delay  |
| `fps`                      | —         | From `useVideoConfig()`                              |
| `from` / `to`              | `0` / `1` | Endpoints; may overshoot `to` before settling        |
| `config.mass`              | `1`       | Lower is faster                                      |
| `config.damping`           | `10`      | Higher decelerates harder — `200` removes the bounce |
| `config.stiffness`         | `100`     | Higher is snappier and bouncier                      |
| `config.overshootClamping` | `false`   | Clamps at `to` instead of overshooting               |
| `durationInFrames`         | —         | Stretches the curve to exactly this length           |
| `delay`                    | `0`       | Frames to hold the initial value (from 3.3.90)       |
| `reverse`                  | `false`   | Plays backwards (from 3.3.92)                        |

Operations apply in order: stretch to `durationInFrames`, then `reverse`, then `delay`.

Prefer driving other values through the spring rather than setting `from`/`to` directly — it
keeps the timing in one place and reads better:

```tsx
const driver = spring({ frame, fps });
const marginLeft = interpolate(driver, [0, 1], [0, 200]);
const scale = interpolate(driver, [0, 1], [0.8, 1]);
```

`measureSpring({fps, config})` returns how many frames a spring needs to settle — use it when
a sequence's `durationInFrames` should match its animation rather than a guess.

Tune interactively at <https://remotion.dev/timing-editor>.

## Choosing between interpolate and spring

Use `spring()` for anything that should feel physical: entrances, pop-ins, elements settling
into place, cursor moves. Use `interpolate()` when you need exact control over when a value
hits a specific number: a progress bar tied to a known duration, a fade that must finish
before a cut, a camera pan across a fixed distance, a value keyed to audio.

Springs have no crisp end frame, so don't use one for something that must be fully finished
by frame 30 — either stretch it with `durationInFrames`, or use `interpolate()`.

## Staggering and looping

Stagger by offsetting each item's frame. This is a plain expression, so it stays
deterministic:

```tsx
{
  items.map((item, i) => {
    const driver = spring({ frame, fps, delay: i * 4, config: { damping: 200 } });
    return <Row key={item.id} style={{ opacity: driver, translate: `0 ${(1 - driver) * 20}px` }} />;
  });
}
```

Loop a value with modulo — never with state:

```tsx
const loopLength = 60;
const progress = (frame % loopLength) / loopLength;
```

Or wrap children in `<Loop durationInFrames={60}>`, which remounts them each cycle with the
frame reset. `<Loop>` also takes `times` to cap the repetitions.

## Transitions between scenes

`@remotion/transitions` (from 4.0.59) handles cuts where two scenes overlap. Install it
separately.

```tsx
import { linearTiming, springTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';

export const Example: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={60}>
      <SceneA />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      timing={springTiming({ config: { damping: 200 } })}
      presentation={fade()}
    />
    <TransitionSeries.Sequence durationInFrames={60}>
      <SceneB />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      timing={linearTiming({ durationInFrames: 30 })}
      presentation={wipe()}
    />
    <TransitionSeries.Sequence durationInFrames={60}>
      <SceneC />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
```

**A transition shortens the total.** Both scenes render simultaneously while it runs, so
three 60-frame scenes with two 30-frame transitions total 120 frames, not 180. Account for
this in the composition's `durationInFrames` or the video ends on a frozen frame.

Presentations: `fade()`, `slide()` (the default when `presentation` is omitted), `wipe()`,
`flip()`, `clockWipe()`, `iris()`, `none()`. Timings: `linearTiming({durationInFrames})` and
`springTiming({config, durationInFrames})`.

`<TransitionSeries.Overlay durationInFrames={20}>` (from 4.0.415) renders children over the
cut point **without** changing timing — for flashes and light leaks where the scenes should
keep their full length.

## Freeze, Loop, and time manipulation

- `<Freeze frame={30}>` — children permanently see frame 30. Useful for holding a final state
  while other layers keep moving.
- `<Loop durationInFrames={60} times={3}>` — repeats children.
- `<Sequence trimBefore>` / `trimAfter` — trims children's visible window without moving them
  on the parent timeline (older versions call these `from`-relative offsets).
- `<Sequence premountFor={30}>` — mounts children early, invisibly, so images and video have
  time to load before their first visible frame. Reach for this when the first frame of a
  scene renders unloaded.

## Patterns worth copying

**Entrance that settles, then holds:**

```tsx
const enter = spring({ frame, fps, config: { damping: 200 } });
const style = {
  opacity: enter,
  scale: interpolate(enter, [0, 1], [0.9, 1], { output: 'perceptual-scale' }),
};
```

**Text revealed word by word:**

```tsx
const words = text.split(' ');
return words.map((word, i) => {
  const appear = spring({ frame, fps, delay: i * 3, config: { damping: 200 } });
  return (
    <span key={i} style={{ opacity: appear, display: 'inline-block' }}>
      {word}{' '}
    </span>
  );
});
```

**Number counting up, ending exactly on time:**

```tsx
const value = interpolate(frame, [0, 2 * fps], [0, target], {
  easing: Easing.out(Easing.cubic),
  extrapolateRight: 'clamp',
});
return <span>{Math.round(value).toLocaleString()}</span>;
```

**Camera push using scale on a wrapper**, so children need no changes:

```tsx
<AbsoluteFill
  style={{
    scale: String(interpolate(frame, [0, durationInFrames], [1, 1.08])),
    transformOrigin: 'center',
  }}
>
  <Scene />
</AbsoluteFill>
```

A slow push like this hides the fact that a static shot is static — cheap and effective.

## Things that look like animation but break rendering

- CSS `transition` and `@keyframes` — driven by wall clock, so parallel tabs disagree.
  Convert to frame-driven inline styles.
- `<video autoPlay>` or a raw `<audio>` tag — use Remotion's media components.
- Libraries that animate imperatively over real time (GSAP timelines, Framer Motion's
  `animate`, Lottie played by its own clock). Some have Remotion integrations that accept a
  frame or progress value; check <https://remotion.dev/docs/third-party> before wiring one in
  by hand, and drive it from `useCurrentFrame()` if you do.
- `useState` + `useEffect` incrementing a counter — each tab starts from scratch.
