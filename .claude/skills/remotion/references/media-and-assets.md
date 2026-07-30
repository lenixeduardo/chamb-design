# Media and assets

## Contents

- [staticFile() and the public folder](#staticfile-and-the-public-folder)
- [Images](#images)
- [Video](#video)
- [Audio](#audio)
- [Fonts](#fonts)
- [Captions and subtitles](#captions-and-subtitles)
- [Measuring text and layout](#measuring-text-and-layout)
- [Tailwind and styling](#tailwind-and-styling)
- [Why assets cause flicker](#why-assets-cause-flicker)

## staticFile() and the public folder

Files in `public/` are served by Remotion, but you must resolve their URL through
`staticFile()` rather than writing a bare path — the served prefix is generated and differs
between the Studio, a bundle, and Lambda.

```tsx
import { Img, staticFile } from 'remotion';

<Img src={staticFile('my-image.png')} />;
```

`public/` must sit next to the `package.json` that depends on `remotion`, even if your source
lives in a subdirectory. A leading slash is optional.

`getStaticFiles()` lists them at runtime, and `watchStaticFile(path, cb)` reacts to changes in
the Studio — handy when a build step writes assets while you work.

Remote URLs work directly. `prefetch(url)` starts a download early and returns
`{free, waitUntilDone}`, so you can avoid a stall on the first frame that needs a large
remote file.

## Images

Use `<Img>` from `remotion`, not a plain `<img>`: it tells the renderer to wait for the image
to decode, so you never screenshot a blank box.

```tsx
import { AbsoluteFill, Img, staticFile } from 'remotion';

<AbsoluteFill>
  <Img src={staticFile('bg.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
</AbsoluteFill>;
```

Avoid the CSS `background-image` and `mask-image` properties — Remotion cannot detect when
they finish loading, so they are a common source of missing visuals in the output. Use an
`<Img>` layer instead.

`<Gif>` from `@remotion/gif` synchronizes GIF playback to the timeline; a GIF in an `<Img>`
freezes on its first frame.

## Video

`<Video>` from `@remotion/media` is the recommended component. During rendering it extracts
the exact frame with Mediabunny and draws it to a `<canvas>`, so the video stays locked to
Remotion's timeline instead of drifting with playback speed.

```tsx
import { AbsoluteFill, staticFile } from 'remotion';
import { Video } from '@remotion/media';

export const MyVideo = () => (
  <AbsoluteFill>
    <Video src={staticFile('clip.mp4')} />
  </AbsoluteFill>
);
```

Remote URLs and HLS playlists (`.m3u8`) both work. It has native buffering support, so in the
`<Player>` it pauses and resumes on its own.

Useful props: `from` and `durationInFrames` (same meaning as on `<Sequence>`, so you can trim
without an extra wrapper), `trimBefore`/`trimAfter`, `volume`, `playbackRate`, `muted`,
`toneFrequency`, `effects` (from 4.0.464), and `cropLeft`/`cropTop`/`cropRight`/`cropBottom`
(from 4.0.500).

**The three video components, and when each applies:**

| Component                       | Use when                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `<Video>` (`@remotion/media`)   | Default choice. Frame-exact, works in client-side rendering                                 |
| `<OffthreadVideo>` (`remotion`) | Frame extraction via FFmpeg outside the browser. Not supported in `@remotion/web-renderer`  |
| `<Html5Video>` (`remotion`)     | A real `<video>` tag. Only when you need native element behaviour; several of these stutter |

`remotion` also still exports `Video` as an alias for the HTML5 element path. Import from
`@remotion/media` explicitly to get the recommended one.

Trim and place a clip with a `<Sequence>` around it, or with the props directly:

```tsx
<Sequence from={30} durationInFrames={90}>
  <Video src={staticFile('clip.mp4')} trimBefore={60} />
</Sequence>
```

`volume` accepts a function of frame for fades — the frame it receives is relative to the
component, so frame 0 is the clip's first frame:

```tsx
<Video src={src} volume={(f) => interpolate(f, [0, 30], [0, 1], { extrapolateRight: 'clamp' })} />
```

## Audio

```tsx
import { staticFile } from 'remotion';
import { Audio } from '@remotion/media';

<Audio src={staticFile('music.mp3')} />;
```

Same timing props as `<Video>`: `from`, `durationInFrames`, `trimBefore`, `trimAfter`,
`volume`, `playbackRate`, `muted`, `loop`. Audio placed inside a `<Sequence>` cascades exactly
like video.

To size a composition to its soundtrack, read the audio's duration in `calculateMetadata`
with `parseMedia()` from `@remotion/media-parser` (or the older
`getAudioDurationInSeconds()` from `@remotion/media-utils`) and return `durationInFrames`. See
`references/props-and-data.md`.

For waveforms and audiograms, `@remotion/media-utils` provides `useAudioData(src)` and
`visualizeAudio({audioData, frame, fps, numberOfSamples})`. Both are frame-driven, so bars
stay in sync:

```tsx
import { useAudioData, visualizeAudio } from '@remotion/media-utils';

const audioData = useAudioData(src);
if (!audioData) return null; // still loading — the hook blocks the render for you

const bars = visualizeAudio({ audioData, frame, fps, numberOfSamples: 32 });
```

Audio codecs: rendering to `mp3`, `aac`, or `wav` via `--codec` gives an audio-only file.

## Fonts

Text rendered before its font loads gets screenshotted in the fallback font — a subtle bug,
because it often only affects the first few frames or a single parallel tab.

**Google Fonts** — type-safe, no CSS files:

```tsx
import { loadFont } from '@remotion/google-fonts/TitanOne';

const { fontFamily } = loadFont('normal', { weights: ['400'], subsets: ['latin'] });

export const Comp = () => <div style={{ fontFamily }}>Hello</div>;
```

**Local fonts** with `@remotion/fonts` (from 4.0.164). Put the file in `public/`:

```tsx
import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

loadFont({ family: 'Inter', url: staticFile('Inter-Regular.woff2'), weight: '500' });
```

**CSS import** also works — Remotion waits for fonts loaded this way since v2.2:

```css
@import url('https://fonts.googleapis.com/css2?family=Bangers');
```

**Manual `FontFace`** does _not_ block the render on its own. Wrap it:

```tsx
import { continueRender, delayRender, staticFile } from 'remotion';

const handle = delayRender('Loading font');
const font = new FontFace('Inter', `url(${staticFile('Inter.woff2')}) format('woff2')`);
font.load().then(() => {
  document.fonts.add(font);
  continueRender(handle);
});
```

With several fonts, load them in one shared module and wait for all of them before rendering
text, rather than per-component.

## Captions and subtitles

`@remotion/captions` provides a `Caption` type plus `parseSrt()`, `serializeSrt()`, and
`createTikTokStyleCaptions()` for grouping words into on-screen pages.
`@remotion/whisper-web` and `@remotion/install-whisper-cpp` transcribe audio locally to
produce those captions.

Render a caption page by finding the active one for the current frame — a pure lookup, so it
stays deterministic:

```tsx
const timeInMs = (frame / fps) * 1000;
const active = pages.find((p) => timeInMs >= p.startMs && timeInMs < p.endMs);
```

## Measuring text and layout

`@remotion/layout-utils` provides `measureText()`, `fitText()`, and `fillTextBox()` — for
shrinking a headline to fit, or wrapping text at an exact box width.

Only call them **after fonts are loaded**. Measuring against a fallback font gives a wrong
size that then bakes into the render. The docs' higher-order-component pattern is the
reliable way to gate this.

`useVideoConfig()` gives you `width` and `height`, which is how you make a layout adapt when
the same composition renders at 1080p and 4K, or in both 16:9 and 9:16.

## Tailwind and styling

Tailwind v4 is supported from 4.0.256, and `npx create-video@latest` can scaffold it.
Otherwise inline styles are the norm in Remotion, and they read well here because most values
are computed per frame anyway.

One caveat: animate through inline `style`, not by swapping Tailwind classes per frame. Class
switching gives you the discrete steps of the utility scale, and any class carrying a CSS
`transition` reintroduces wall-clock timing.

## Why assets cause flicker

Remotion screenshots whatever is on screen at each frame. If an asset hasn't loaded, you get
its loading state — and since the renderer uses several tabs in parallel, only some frames
may be affected, which is why it reads as flicker rather than a clean failure.

Remotion's components (`<Img>`, `<Video>`, `<Audio>`, `<OffthreadVideo>`, `<IFrame>`,
`<Gif>`) register the wait for you. Everything you load by hand — `fetch`, `FontFace`, a
canvas texture, a WASM module — needs `delayRender()`.

Checklist when frames come out blank or unstyled:

1. Any raw `<img>`, `<video>`, or `<audio>` tags? Replace with Remotion components.
2. Any `background-image` or `mask-image`? Replace with an `<Img>` layer.
3. Fonts loaded through a path that blocks the render?
4. Any `fetch` without `delayRender()`?
5. Text measured before fonts were ready?
6. Does the scene's first frame need a `premountFor` on its `<Sequence>` so media loads ahead
   of the cut?
