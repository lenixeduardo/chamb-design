# Rendering

## Contents

- [CLI](#cli)
- [Codecs and output formats](#codecs-and-output-formats)
- [Flags worth knowing](#flags-worth-knowing)
- [remotion.config.ts](#remotionconfigts)
- [Node / SSR API](#node--ssr-api)
- [Lambda](#lambda)
- [CI and Docker](#ci-and-docker)
- [Debugging renders](#debugging-renders)

## CLI

```bash
npx remotion studio                                   # interactive timeline + props editor
npx remotion compositions                             # list composition IDs, fps, durations
npx remotion render <composition-id> out/video.mp4    # render a video
npx remotion still <composition-id> out/frame.png     # render one frame
npx remotion bundle                                   # build a reusable serve URL
npx remotion versions                                 # check all @remotion/* versions match
npx remotion gpu                                      # report the GPU/ANGLE backend in use
```

The full form is `npx remotion render <entry-point|serve-url>? <composition-id> <output-location>`.
The entry point is auto-detected (`src/index.ts` and friends), so you usually omit it. Omit
the composition ID and Remotion prompts; omit the output location and it writes into `out/`.

Keep every `@remotion/*` package on the same version — mismatches produce confusing runtime
errors, which is what `npx remotion versions` is for.

## Codecs and output formats

`--codec` accepts `h264` (default), `h265`, `vp8`, `vp9`, `av1`, `prores`, `gif`, `mp3`,
`aac`, `wav`, `h264-mkv`, and `png`.

| Goal                 | Command                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| Standard MP4         | `npx remotion render MyComp out/video.mp4`                                      |
| Transparent video    | `npx remotion render MyComp out/video.webm --codec=vp8 --pixel-format=yuva420p` |
| ProRes for an editor | `npx remotion render MyComp out/video.mov --codec=prores --prores-profile=4444` |
| GIF                  | `npx remotion render MyComp out/video.gif --codec=gif --every-nth-frame=2`      |
| Audio only           | `npx remotion render MyComp out/audio.mp3 --codec=mp3`                          |
| PNG sequence         | `npx remotion render MyComp out/frames --sequence`                              |
| Single still         | `npx remotion still MyComp out/thumb.png --frame=45`                            |

Transparency needs both a codec that supports an alpha channel (`vp8`/`vp9`/`prores`) and
`--pixel-format=yuva420p`; H.264 cannot carry alpha at all. `--frame` on `still` also accepts
negative values counted from the end.

`av1` is unavailable on Linux ARM64 GNU.

## Flags worth knowing

**Parameterization**

- `--props='{"k":"v"}'` or `--props=./props.json` — input props. Use a file on Windows.
- `--env-file=.env` — load env vars for the render.

**Output geometry** — override the composition without editing code:

- `--width`, `--height` (3.2.40+), `--fps` (4.0.424+), `--duration` (4.0.424+)
- `--scale=2` — renders at 2× the composition's dimensions. Better than doubling `width`/`height`
  because layout stays identical; only the raster resolution changes.

**Speed and iteration**

- `--frames=0-90` or `--frames=50` — render a subset. The fastest way to check a specific moment.
- `--concurrency=N` — parallel tabs. Defaults to about half your cores.
- `--jpeg-quality=N` (0–100) — only meaningful with JPEG frames.
- `--image-format=jpeg|png|none` — `png` when you need alpha, `jpeg` otherwise (faster).
- `--bundle-cache=false` — force a clean bundle when you suspect a stale one.

**Quality**

- `--crf=N` — the main quality dial. Lower is better; 18 is high quality for H.264, 23 is the
  usual default, 28 is visibly lossy.
- `--video-bitrate`, `--audio-bitrate`, `--buffer-size`, `--max-rate` — for hitting a target
  file size or a platform's spec.
- `--audio-codec`, `--pixel-format`, `--prores-profile`, `--color-space`.
- `--muted` / `--enforce-audio-track`.

**Robustness**

- `--timeout=N` — raise the per-`delayRender()` timeout (default 30 s).
- `--log=verbose` — what to attach to a bug report.
- `--gl=angle|swangle|egl|swiftshader` — the WebGL backend. `--gl=angle` is the usual fix for
  Three.js/WebGL content rendering black.
- `--overwrite=false` — refuse to clobber an existing file (overwriting is the default).
- `--chrome-mode=headless-shell|chrome-for-testing` — WebGL and some codecs need full Chrome.
- `--repro` — bundles a reproduction for filing an issue.

## remotion.config.ts

Defaults for the CLI, in the project root. It is **not** read during rendering itself — only
by the CLI and the Studio — so the Node and Lambda APIs need their options passed explicitly.

```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setConcurrency(4);
Config.setCrf(18);
Config.setOverwriteOutput(true);
Config.setTimeoutInMilliseconds(60000);
Config.setChromiumOpenGlRenderer('angle');
```

Also the place for a webpack override (Tailwind, custom loaders, path aliases):

```ts
Config.overrideWebpackConfig((config) => ({
  ...config,
  // ...
}));
```

If you have a webpack override, pass the same function as `webpackOverride` to `bundle()` in
the Node API, or the programmatic render will behave differently from the CLI.

CLI flags beat config values.

## Node / SSR API

Three steps: bundle, select, render.

```ts
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'path';

const compositionId = 'HelloWorld';

// Bundle once; reuse for many renders.
const bundleLocation = await bundle({
  entryPoint: path.resolve('./src/index.ts'),
  webpackOverride: (config) => config,
});

const inputProps = { foo: 'bar' };

const composition = await selectComposition({
  serveUrl: bundleLocation,
  id: compositionId,
  inputProps,
});

await renderMedia({
  composition,
  serveUrl: bundleLocation,
  codec: 'h264',
  outputLocation: `out/${compositionId}.mp4`,
  inputProps,
});
```

Pass `inputProps` to **both** `selectComposition()` and `renderMedia()`. `selectComposition`
runs `calculateMetadata`, so skipping it there gives you a composition whose duration doesn't
match the props the component receives.

Other APIs: `getCompositions()`, `renderStill()`, `renderFrames()`,
`stitchFramesToVideo()`, `openBrowser()` (share one browser across renders — a large win when
rendering many videos in a loop), and `ensureBrowser()`.

`renderMedia()` takes `onProgress` for progress reporting and `onBrowserLog` for surfacing
in-page console output, which is otherwise invisible.

Works in Node and Bun. On Linux, Chrome Headless Shell needs shared libraries installed — see
the Linux dependencies doc; missing them is the usual cause of a render that fails instantly
in a container.

**Next.js cannot use `@remotion/bundler`** (webpack-in-webpack). Use Lambda, or render in a
separate service.

## Lambda

`@remotion/lambda` renders by splitting the video into chunks across many concurrent
functions, so a long video finishes far faster than real time.

```bash
npx remotion lambda functions deploy
npx remotion lambda sites create src/index.ts --site-name=my-video
npx remotion lambda render <serve-url> MyComp --props=./props.json
```

Programmatically:

```ts
import { renderMediaOnLambda, getRenderProgress } from '@remotion/lambda/client';

const { renderId, bucketName } = await renderMediaOnLambda({
  region: 'us-east-1',
  functionName: 'remotion-render-...',
  serveUrl: 'https://...',
  composition: 'MyComp',
  inputProps: {},
  codec: 'h264',
  framesPerLambda: 20,
});

const progress = await getRenderProgress({ renderId, bucketName, functionName, region });
```

Import from `@remotion/lambda/client` in a serverless or edge context — the root entry pulls in
the full renderer and bloats the bundle.

Redeploy the site whenever your composition code changes; the function only needs redeploying
on a Remotion upgrade. Keep the deployed function's Remotion version equal to your project's.

Constraints to plan around: the function needs enough memory and disk for your frames, the
render has a Lambda timeout, and `--concurrency=1` workarounds don't work here — Lambda is
inherently parallel, so a video that needs sequential rendering must be fixed rather than
flagged around.

## CI and Docker

GitHub Actions:

```yaml
name: Render video
on:
  workflow_dispatch:
    inputs:
      titleText:
        description: 'Which text should it say?'
        required: true
        default: 'Welcome to Remotion'
jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@main
      - uses: actions/setup-node@main
      - run: npm i
      - run: echo $WORKFLOW_INPUT > input-props.json
        env:
          WORKFLOW_INPUT: ${{ toJson(github.event.inputs) }}
      - run: npx remotion render MyComp out/video.mp4 --props="./input-props.json"
      - uses: actions/upload-artifact@v4
        with:
          name: out.mp4
          path: out/video.mp4
```

Writing the props to a file rather than inlining them avoids shell-quoting problems with
user-supplied text.

For Docker, follow the official Dockerfile in the Remotion docs — the Chrome shared-library
list is the part that's easy to get wrong. Other hosts covered by the docs: Vercel Sandbox,
Azure Container Apps, Cloudflare Containers. GCP Cloud Run exists but is alpha and not
actively developed.

## Debugging renders

**Flicker, stutter, or nondeterministic output.** Go through the five rules in `SKILL.md`.
Rendering is parallel across tabs, so any wall-clock dependency, unseeded randomness, or
unawaited asset shows up here. `--concurrency=1` is a diagnostic, not a fix — it also blocks
Lambda and still gives machine-dependent timing.

**Blank or partially-loaded frames.** An asset the renderer didn't know to wait for. See the
checklist at the end of `references/media-and-assets.md`.

**`A delayRender() was called but not cleared after 28000ms`.** A promise never resolved, or
rejected without `cancelRender()`. The message quotes the label you passed to
`delayRender()` — which is why passing one matters. Raise `--timeout` only once you know the
work is legitimately slow.

**Black frames with Three.js / WebGL.** Try `--gl=angle`, then `--gl=swangle` for software
rendering in headless environments. `npx remotion gpu` reports what's actually active, and
`--chrome-mode=chrome-for-testing` provides a browser with fuller GPU support.

**Slow renders.** In order of effect: raise `--concurrency`; use `--image-format=jpeg`; keep
`--scale` at 1 while iterating; reuse a bundle instead of rebundling; move heavy work out of
the component into `calculateMetadata()` so it runs once instead of per tab; reuse a browser
via `openBrowser()` when rendering many videos. For a long single video, Lambda beats local
tuning.

**Audio missing or out of sync.** Use `<Audio>`/`<Video>` from `@remotion/media` rather than
raw tags, check the composition isn't `--muted`, use `--enforce-audio-track` when a downstream
tool requires an audio stream, and verify the chosen codec carries audio.

**Output looks right in the Studio but wrong when rendered.** This is the signature of a
determinism bug. The Studio is single-tab and time-based; the renderer is neither. Trust the
render, and check the five rules.

**Bundle or version weirdness.** `npx remotion versions` to confirm all `@remotion/*` packages
match, and `--bundle-cache=false` to rule out a stale bundle.

**`TypeError: Cannot read properties of undefined (reading 'readFile')` during bundling.** Raised
from `@remotion/bundler/dist/esbuild-loader`, and it means the project's TypeScript is too new:
the loader calls `typescript.sys.readFile`, which the TypeScript 7 rewrite no longer exposes.
`npm i -D typescript@5` fixes it. Worth checking early, because `npm i -D typescript` installs
7.x by default and the error names webpack rather than TypeScript, which sends you looking in
the wrong place.

**`Host not in allowlist` / 403 while downloading Chrome Headless Shell.** Remotion fetches its
own browser on first render, which fails in sandboxes and CI images with restricted egress.
Point it at a browser that is already present instead — `--browser-executable=/path/to/chrome`
works on `render`, `still`, and `compositions` alike, and `Config.setBrowserExecutable()` sets
it project-wide. Playwright-based images usually have one under `/opt/pw-browsers`. Use
`--browser-executable` rather than allowlisting a download host when you only need to get a
render through.
