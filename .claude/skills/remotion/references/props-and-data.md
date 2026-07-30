# Props, data, and dynamic metadata

The point of Remotion over a video editor is that a video becomes a function of data. This is
how the data gets in.

## Contents

- [How props resolve](#how-props-resolve)
- [Default props](#default-props)
- [Input props](#input-props)
- [calculateMetadata()](#calculatemetadata)
- [Zod schemas and visual editing](#zod-schemas-and-visual-editing)
- [Fetching inside the component](#fetching-inside-the-component-delayrender)
- [Common patterns](#common-patterns)

## How props resolve

Four stages, in order:

1. **`defaultProps`** on `<Composition>` — static, define the shape, let the video be designed
   in the Studio with no data.
2. **Input props** — supplied at render time (`--props`, or `inputProps` in the Node/Lambda
   APIs). Merged over `defaultProps`, shallowly; input props win.
3. **`calculateMetadata()`** — receives the merged props and may transform them and/or compute
   `durationInFrames`, `fps`, `width`, `height`.
4. **Final props** reach the component.

Knowing this order matters because a prop that "isn't taking effect" is almost always being
overwritten one stage later, or is nested inside an object that the shallow merge replaced
wholesale.

## Default props

```tsx
type Props = {
  title: string;
  items: { label: string; value: number }[];
};

const MyComp: React.FC<Props> = ({ title, items }) => null;

<Composition
  id="MyComp"
  component={MyComp}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{ title: 'Hello', items: [] }}
/>;
```

Rules that bite:

- Props must be **JSON-serializable**. Functions and class instances are silently dropped
  during rendering — they survive in the Studio and in `<Player>`, which is exactly what makes
  this confusing. `Date`, `Map`, `Set`, and `staticFile()` are handled specially and do
  survive.
- Type props with a **`type`, not an `interface`**, or `defaultProps` won't typecheck against
  them.
- Keep `defaultProps` small. Large objects are embedded in the bundle and slow the Studio and
  the render; fetch in `calculateMetadata()` instead.
- `<Player>` is the exception on serializability — it takes functions as props fine.

## Input props

CLI:

```bash
npx remotion render MyComp out/video.mp4 --props='{"title":"Hi","items":[]}'
npx remotion render MyComp out/video.mp4 --props=./props.json
```

Use a **file** on Windows shells, which strip the `"` characters out of inline JSON.

Node API — pass the same `inputProps` to both `selectComposition()` and `renderMedia()`, or
metadata computed from props won't match what the component receives:

```ts
const composition = await selectComposition({ serveUrl, id, inputProps });
await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation, inputProps });
```

Inside a component, `getInputProps()` returns the raw input props without the merge. Prefer
real props; reach for this only outside a composition (for example in `Root.tsx` to register
compositions dynamically).

## calculateMetadata()

This is the most useful API in Remotion for real work: it runs before the render and can both
fetch data and decide the video's dimensions and length.

```tsx
type ApiResponse = { title: string; description: string };
type Props = { id: string; data: ApiResponse | null };

<Composition
  id="MyComp"
  component={MyComp}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{ id: '1', data: null }}
  calculateMetadata={async ({ props }) => {
    const res = await fetch(`https://example.com/api/${props.id}`);
    const json = await res.json();
    return { props: { ...props, data: json } };
  }}
/>;
```

The callback receives `{props, defaultProps, abortSignal, compositionId}` and returns any of
`{props, durationInFrames, fps, width, height}` — return only what you want to change.

**Type it with a nullable field**, as above. The input and output props must be the same
TypeScript type, so model "not fetched yet" as `null` and throw inside the component if it is
still null at render time. That gives you a real error instead of a blank frame.

**Length from content** — the case that justifies this API. A video whose duration is
hardcoded while its content is data-driven will always eventually cut off mid-sentence:

```tsx
calculateMetadata={async ({props}) => {
  const {slowDurationInSeconds} = await parseMedia({
    src: props.audioSrc,
    fields: {slowDurationInSeconds: true},
    acknowledgeRemotionLicense: true,
  });
  return {durationInFrames: Math.ceil(slowDurationInSeconds * 30)};
}}
```

For a list-driven video, compute it from the data instead:
`durationInFrames: props.items.length * 60 + 90`.

**Aspect ratio from a prop** — one composition serving landscape, square, and vertical:

```tsx
calculateMetadata={({props}) => {
  const sizes = {landscape: [1920, 1080], square: [1080, 1080], vertical: [1080, 1920]} as const;
  const [width, height] = sizes[props.format];
  return {width, height};
}}
```

The component then reads `useVideoConfig()` and lays out accordingly, rather than you
maintaining three near-duplicate compositions.

Note that `calculateMetadata` runs in Node during rendering, so it can be async and hit the
network, but it cannot touch the DOM.

## Zod schemas and visual editing

Pass a Zod schema as `schema` and the Studio renders a form for the props, with validation:

```tsx
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';

const myCompSchema = z.object({
  title: z.string(),
  color: zColor(),
});

const MyComp: React.FC<z.infer<typeof myCompSchema>> = ({ title, color }) => null;

<Composition
  id="MyComp"
  component={MyComp}
  schema={myCompSchema}
  defaultProps={{ title: 'Hello', color: '#0b84f3' }}
  durationInFrames={150}
  fps={30}
  width={1920}
  height={1080}
/>;
```

`defaultProps` must satisfy the schema. `@remotion/zod-types` adds `zColor()` (colour picker),
`zTextarea()`, and `zMatrix()`. This is worth adding whenever a non-developer will be changing
the video's content — it turns the Studio into an editor for them, and it catches malformed
input props at render time rather than mid-render.

## Fetching inside the component (delayRender)

Prefer `calculateMetadata()`. Fetch inside the component only when the data isn't
JSON-serializable or genuinely must be loaded in the browser (a canvas texture, a WASM
module).

The renderer will not wait for your promise unless you tell it to. `useDelayRender()` is the
current form — it also works under browser rendering, which the bare functions do not:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useDelayRender } from 'remotion';

export const MyVideo = () => {
  const [data, setData] = useState(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Fetching API data'));

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('https://example.com/api');
      setData(await res.json());
      continueRender(handle);
    } catch (err) {
      cancelRender(err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  return <div>{data ? JSON.stringify(data) : null}</div>;
};
```

Three things to get right:

- **Always resolve the handle.** `continueRender()` on success, `cancelRender(err)` on failure.
  Swallowing the error leaves the render hanging until it times out with a confusing message.
- **The timeout is 30 seconds** per handle by default. Raise it with `--timeout` or
  `setTimeoutInMilliseconds()` in `remotion.config.ts` if the work is genuinely slow.
- **Pass a label** — `delayRender('Fetching API data')` — because the timeout error quotes it,
  and that is the difference between a five-second diagnosis and a long hunt.

Remember this runs **per frame batch**, once per parallel tab, not once per video. A fetch here
multiplies by concurrency; another reason to prefer `calculateMetadata()`.

## Common patterns

**One composition, many outputs.** Keep the composition generic and drive everything from
props, then loop the render in a script with different `--props`. That is the whole
personalized-video use case, and it's why hardcoding content into the component is worth
avoiding from the first commit.

**Registering compositions from data.** `Root.tsx` is a React component, so you can map over
a list — but the list has to be available synchronously at module load (imported JSON, or
`getInputProps()`), since `Root.tsx` renders in the browser.

**Guarding null data:**

```tsx
export const MyComp: React.FC<Props> = ({ data }) => {
  if (!data) {
    throw new Error('data was not fetched — did calculateMetadata run?');
  }
  // ...
};
```

An explicit throw fails the render with a clear message. Rendering `null` instead gives you a
silently blank video, which is much worse to debug.
