# Licensing notice

**This plugin's own code is MIT.** Remotion is not, and OpenDesign does not
install it for you.

## Why Remotion is a peer dependency

Remotion ships under the [Remotion License](https://remotion.dev/license), not
an OSI-approved open source licence. In short:

| Who you are                                       | What you need            |
| ------------------------------------------------- | ------------------------ |
| An individual                                     | Free                     |
| A for-profit company with **up to 3 employees**   | Free                     |
| A non-profit                                      | Free                     |
| Evaluating, not yet commercial                    | Free                     |
| A for-profit company with **4 or more employees** | **Paid company licence** |

It also forbids relicensing or reselling a derivative of Remotion.

Making it a `dependency` would mean every `pnpm install` of OpenDesign pulls
non-MIT code into an MIT project, and every downstream company over three people
would silently acquire a licence obligation they never agreed to. So it is a
**peer dependency, marked optional**:

```bash
# Only if you want video output, and only if the terms above suit you.
pnpm add remotion @remotion/renderer @remotion/bundler
```

## What still works without installing it

The **export target** does. It emits a runnable Remotion project — TSX files,
composition config, `package.json` — using nothing but string generation, the
same way the React and Vue targets work. You get the code and decide whether to
`npm install` it.

What requires Remotion locally is `@opendesign/plugin-remotion/render`, which
actually renders an MP4. That module imports `@remotion/renderer` and will throw
a clear error naming the missing package if it is absent.

## Alternatives, if the licence does not suit you

- The `css` motion engine (default) needs nothing and animates in any browser.
- The GSAP path has its own licence considerations for some plugins, but the core
  is free.
- For MP4 output without Remotion, drive `ffmpeg` over a frame sequence from the
  canvas. Rougher, fully permissive.
