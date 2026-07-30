---
name: remotion
description: >-
  Build and render videos programmatically with Remotion, the React video framework —
  compositions, frame-driven animation with interpolate()/spring(), Sequence timing,
  audio and video assets, and rendering to MP4/WebM/GIF via the CLI, Node APIs, or Lambda.
  Use this skill whenever the user wants to create, animate, template, or render a video:
  MP4 output, motion graphics, animated intros/outros, lower thirds, subtitle or caption
  overlays, data-driven or per-customer videos, product demos, audiograms, animated charts,
  or programmatic thumbnails and stills. Also use it whenever a project contains a
  `remotion.config.ts`, a `src/Root.tsx` with `<Composition>`, or a `remotion` dependency —
  even for a change that looks like ordinary React work, because Remotion components have
  determinism rules normal React does not. And use it when a rendered video flickers,
  stutters, comes out blank, drops audio, or desyncs, since those are almost always
  Remotion-specific timing bugs with known causes.
---

# Remotion

Remotion renders React components to video. It hands your component a frame number and a
blank canvas; you return what that single frame looks like. Rendering means screenshotting
frame 0, 1, 2, … and encoding the result with FFmpeg.

That one sentence determines everything else, including the mistakes. Internalize it before
writing code: **your component is a pure function from frame number to image.** Remotion
opens several browser tabs and renders frame ranges in parallel, so a component that
depends on elapsed wall-clock time, on having rendered earlier frames, or on unseeded
randomness will produce a different image in each tab — which the viewer sees as flicker.

Targets Remotion 4.x (`remotion@4.0.501` at time of writing). Version-gated APIs are
flagged inline.

## Deciding what to read

Start here, then load the reference that matches the work. Each is self-contained; don't
read all four.

| Reference                        | Load it when                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `references/animation.md`        | Animating anything: easing, springs, staggering, camera moves, transitions between scenes, looping   |
| `references/media-and-assets.md` | Video, audio, images, fonts, captions, GIFs, Tailwind, measuring text                                |
| `references/props-and-data.md`   | Parameterizing a video, Zod schemas, fetching data, computing duration from data                     |
| `references/rendering.md`        | Rendering, encoding, CLI flags, Node/SSR APIs, Lambda, CI, Docker, debugging slow or failing renders |

## The five rules that prevent almost every Remotion bug

**1. `useCurrentFrame()` is the only clock.** Never `setInterval`, `requestAnimationFrame`,
`Date.now()`, CSS `animation`/`transition`, `<video autoPlay>`, or a state variable that
advances over time. Each of those runs on wall-clock time, which is unrelated to the frame
being rendered. Derive every animated value from the frame:

```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
```

**2. Clamp your interpolations.** `interpolate()` extrapolates past its input range by
default, so `interpolate(frame, [0, 20], [0, 1])` returns `2` at frame 40 and your element
becomes invisible or enormous later in the video. Pass `extrapolateLeft: 'clamp'` and
`extrapolateRight: 'clamp'` unless you specifically want the value to keep growing. This is
the single most common Remotion bug after rule 1.

**3. Think in frames, derive them from `fps`.** Durations are frame counts, not seconds. Get
`fps` from `useVideoConfig()` and multiply, so the video survives a framerate change:
`const holdFor = 1.5 * fps` rather than a hardcoded `45`. A composition's first frame is
`0` and its last is `durationInFrames - 1`.

**4. Seed your randomness.** `Math.random()` returns different values in each render tab.
Use `random(seed)` from `remotion`, which is deterministic for a given number or string
seed: `random(\`particle-${i}\`)`. Pass `random(null)` when you genuinely want a fresh value
and want to bypass the lint warning.

**5. Block the render until assets are ready.** Remotion screenshots whatever is on screen,
including a half-loaded state. Remotion's own components (`<Img>`, `<Video>`, `<Audio>`,
`<OffthreadVideo>`, `<IFrame>`) already tell the renderer to wait. Anything else you load
yourself — `fetch`, a manual `FontFace`, a canvas texture — does not, so wrap it in
`delayRender()`/`continueRender()`. See `references/props-and-data.md`.

When someone reports flicker, choppiness, or "it looks fine in the Studio but wrong in the
output", walk these five rules before anything else. `--concurrency=1` hides rule-1 and
rule-5 violations at a large speed cost and still gives inconsistent timing across machines
— treat reaching for it as a diagnosis, not a fix.

## Project shape

```
my-video/
├─ public/            Assets reachable via staticFile()
├─ src/
│  ├─ index.ts        registerRoot(RemotionRoot)
│  ├─ Root.tsx        <Composition> registrations — the video's manifest
│  └─ MyVideo.tsx     The component that draws a frame
├─ remotion.config.ts Render defaults (never read during rendering itself)
└─ package.json
```

`src/index.ts` is the entry point:

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

`src/Root.tsx` declares each renderable video. Nothing is renderable until it is registered
here, and the `id` is what you pass on the command line:

```tsx
import { Composition } from 'remotion';
import { MyVideo } from './MyVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MyVideo"
        component={MyVideo}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ title: 'Hello' }}
      />
    </>
  );
};
```

Register several compositions by adding siblings inside the fragment. `defaultProps` must be
JSON-serializable (plus `Date`, `Map`, `Set`, and `staticFile()`, which Remotion serializes
for you) — a function passed as a prop is silently lost during rendering. Type props with a
`type`, not an `interface`, so `defaultProps` typechecks.

Use `<Still>` instead of `<Composition>` for a single-frame output like a thumbnail or an
OG image; it takes the same props minus `durationInFrames` and `fps`.

To scaffold a fresh project, run `npx create-video@latest` and pick a template. In an
existing React project, install `remotion @remotion/cli` and add the two files above.

## Writing a composition

`<AbsoluteFill>` is a `div` that fills its parent absolutely — the workhorse for layers and
backgrounds, since children stack instead of flowing. Later siblings paint on top.

```tsx
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

type Props = { title: string };

export const MyVideo: React.FC<Props> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames - 1],
    [0, 1, 1, 0],
  );

  return (
    <AbsoluteFill
      style={{ backgroundColor: '#0b0b0f', justifyContent: 'center', alignItems: 'center' }}
    >
      <h1 style={{ opacity, color: 'white', fontSize: 96 }}>{title}</h1>
    </AbsoluteFill>
  );
};
```

Note the fade-out keyed off `durationInFrames` rather than a literal: the animation stays
correct when the composition length changes.

## Timing with Sequence

`<Sequence>` is how you place things on a timeline. It shifts the frame its children see, so
each scene component can be written as if it starts at frame 0 — which is what makes scenes
reusable and independently testable.

```tsx
<Sequence durationInFrames={30}><Intro /></Sequence>
<Sequence from={30} durationInFrames={45}><Body /></Sequence>
<Sequence from={75}><Outro /></Sequence>
```

Inside `<Sequence from={30}>`, `useCurrentFrame()` returns `0` when the composition is at
frame 30. `durationInFrames` controls how long children stay mounted; omit it and they run
to the end. Nesting cascades — a sequence at `from={60}` inside one at `from={30}` starts at
frame 90. Children are wrapped in an `<AbsoluteFill>` unless you pass `layout="none"`, which
matters when you want the child to participate in the parent's flex layout instead.

For scenes that simply follow one another, `<Series>` computes the offsets so you don't
hand-maintain running totals — a real win, because off-by-one `from` values are tedious to
spot:

```tsx
<Series>
  <Series.Sequence durationInFrames={40}>
    <SceneA />
  </Series.Sequence>
  <Series.Sequence durationInFrames={20}>
    <SceneB />
  </Series.Sequence>
</Series>
```

Use `<TransitionSeries>` from `@remotion/transitions` when scenes should crossfade, slide, or
wipe into each other. See `references/animation.md`.

## Verify by looking at frames

A video that typechecks can still be blank, mistimed, or off-screen, and the render log
won't tell you. Before reporting a composition as done, render a few stills and actually
look at them — reading the images is the only real check.

```bash
.claude/skills/remotion/scripts/preview-frames.sh --list
.claude/skills/remotion/scripts/preview-frames.sh -c MyVideo -f 0,15,45,89 -o /tmp/preview
```

Then `Read` the resulting PNGs. Sample at least the start, a mid-animation frame, and the
last frame (`durationInFrames - 1`) — the endpoints are where clamping and off-by-one
duration bugs show up. Run `--list` first when you don't know the composition IDs or
durations; it prints both.

Stills are much cheaper than a full render, so iterate on them and encode the video only
once the frames look right. When the project has audio or motion you actually need to
judge, render a short frame range instead: `npx remotion render MyVideo out/probe.mp4
--frames=0-90`.

Anything after `--` is forwarded to the underlying Remotion command. In a sandbox or CI image
with restricted network egress, Remotion cannot download its own browser — pass one that is
already installed: `-- --browser-executable=/opt/pw-browsers/chromium/chrome`. See the
debugging section of `references/rendering.md`.

For interactive work, `npx remotion studio` opens a timeline with scrubbing and a props
editor. Mention it to the user, but don't rely on it yourself — it is a long-running
foreground server, and it renders differently from the real renderer precisely because it is
single-tab and time-based.

## Common tasks

**Render a video.** `npx remotion render <composition-id> out/video.mp4`. H.264 by default;
`--codec` for others. See `references/rendering.md` for the flags worth knowing.

**Parameterize it.** `--props='{"title":"Hi"}'` or `--props=./props.json` (use a file on
Windows shells, which strip the quotes). Input props merge over `defaultProps`.

**Compute duration from data.** Don't hardcode `durationInFrames` when the content decides
it — a script of unknown length, an audio track, a list of items. Use `calculateMetadata`
on the composition to return the duration alongside the props. See
`references/props-and-data.md`.

**Add audio or video.** `import {Audio, Video} from '@remotion/media'` — these extract exact
frames and samples, keeping media locked to the timeline. See
`references/media-and-assets.md`.

**Render in the cloud or in CI.** `@remotion/lambda` for parallel cloud rendering, the
`@remotion/renderer` Node API for your own server, or `npx remotion render` in a GitHub
Action. See `references/rendering.md`.

## Licensing

Remotion is source-available, not MIT: companies above a size threshold need a paid company
licence, and free use is limited for commercial work. When adding Remotion to a user's
commercial project, mention this once and point at <https://remotion.dev/license> — it is a
real constraint they should hear from you before shipping, not after.
