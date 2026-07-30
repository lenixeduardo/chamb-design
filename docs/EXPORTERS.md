# Exporters

## Targets

| Id       | Output                                                                |
| -------- | --------------------------------------------------------------------- |
| `react`  | Vite app, function components, Tailwind v4                            |
| `next`   | App Router pages, shared components, root layout                      |
| `html`   | Standalone pages with real CSS — **zero dependencies, no build step** |
| `vue`    | Vue 3 SFCs with `<script setup>`                                      |
| `svelte` | SvelteKit routes and `$lib` components                                |
| `astro`  | Astro pages with frontmatter                                          |

Plus two from bundled plugins:

| Id         | Output                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| `solid`    | Solid components ([`plugin-exporter-solid`](../plugins/plugin-exporter-solid)) |
| `remotion` | An animated video project ([`plugin-remotion`](../plugins/plugin-remotion))    |

### A note on the video target

`remotion` emits a runnable Remotion project — TSX, composition config,
`package.json` — using nothing but string generation, the same as every other
target. It does **not** import Remotion, because Remotion is not MIT licensed
(free for individuals, non-profits and companies up to 3 employees; paid beyond
that). Making it a hard dependency would hand every downstream company a licence
obligation they never agreed to.

Animations come from each node's `motion` spec, mapped onto frames — so the video
matches what the canvas already previews, rather than being authored twice.
Rendering an actual MP4 needs Remotion installed locally and lives behind
`@opendesign/plugin-remotion/render`. See
[the plugin's NOTICE](../plugins/plugin-remotion/NOTICE.md).

## What "clean code" means here

It is a claim that has to be checkable, so it is defined concretely and tested:

**Semantic classes, not arbitrary values.** Markup reads `bg-card rounded-xl
gap-6`, not `bg-[#111113] rounded-[16px] gap-[24px]`. This works because the
token namespaces line up with Tailwind v4's `@theme` conventions, and the
generated theme file defines the matching custom properties. Retheming an
exported project is still a one-file change.

**Shortest correct utility.** Uniform padding collapses to `p-4`; symmetric
padding to `py-4 px-8`; only genuinely asymmetric padding becomes four
utilities.

**Real components, not one giant file.** Each top-level frame becomes its own
component named after the layer — `<Navbar />`, `<Hero />`, `<Pricing />` — and
the page imports them.

**No runtime.** There is no OpenDesign package in the output. Nothing to
install beyond the framework and Tailwind.

**No editor leakage.** `data-od-id` and friends never appear in exported code.
Asserted for every target.

**Correct per dialect.** JSX self-closes void elements and uses `className`;
HTML does neither. Also asserted for every target.

## Architecture

All targets share one element tree:

```
document ──► buildElementTree ──► EmitElement ──► serializeElement(dialect)
                                       │
                                  splitSections
```

`EmitElement` is framework-neutral: a tag, HTML-flavoured attributes, a class
string, text, children. Serializers decide only how to _spell_ it. That is why
six targets stay consistent with each other and with the canvas — the class
names come from the same compiler the renderer uses.

Adding a target means writing a serializer dialect (if the syntax is new) and a
project scaffold. It does not mean writing another tree walker.

## The HTML target

The odd one out, deliberately. Instead of Tailwind classes it emits real CSS
rules — one class per node, plus media queries generated from the responsive
overrides, plus the token set as CSS custom properties.

The result opens in a browser straight from disk. For a one-off landing page, or
for anyone who does not want a build step at all, that is a better deliverable
than a project that needs `pnpm install` first.

## Using it headlessly

```bash
curl -X POST http://localhost:4000/api/export \
  -H 'content-type: application/json' \
  -d '{"target":"next","document":{…}}'
```

Returns `{ targetId, files: [{ path, contents }], totalBytes }`.

The server resolves the exporter through the same registry the editor uses, so
CI output and the Download button cannot drift apart.

## Testing a target

Every built-in target is checked for: non-empty output, unique file paths,
tokens present, no editor attributes, and dialect correctness. The suite lives
in [`packages/exporters/src/__tests__`](../packages/exporters/src/__tests__/exporters.test.ts)
and runs `describe.each` over every registered exporter — so a new target gets
the baseline checks by existing.
