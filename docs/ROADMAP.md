# Roadmap

Ordered by what unblocks the most, and honest about what is not built.

## Done

- Document model with invertible operations, history, snapshots and branches
- Design tokens, themes, and a style compiler with both Tailwind and CSS outputs
- Pure React renderer, decoupled from the editor
- 23-block library across every catalog category, contributed via the plugin API
- Six export targets, all sharing one element tree
- Provider-agnostic AI layer (7 providers) where the model emits operations
- Automated design review: contrast, alt text, labels, tap targets, fixed widths
- Editor: canvas, layers, inspector, library, design system panel, export preview
- Local-first storage with autosave; optional NestJS + Prisma server
- Plugin system with four worked examples and a contract test suite
- Asset pipeline: drop, paste, URL import and AI image generation, all through
  one ingestion path with pluggable storage (inline, HTTP upload, filesystem)
- Image generation providers (gpt-image, DALL·E, Imagen, local servers) behind
  their own contribution point

## Next

**Direct manipulation on canvas.** Geometry is done and tested — `snapRect`
produces alignment guides, `resizeRect` handles all eight handles with aspect
and centre modifiers, `alignRects`/`distributeRects` work off measured boxes.
What is missing is the pointer-event wiring between the overlay and those
functions. This is the largest gap between what the codebase can do and what a
user can do with it.

**Realtime collaboration.** The operation format was designed for this: ops are
small, ordered and invertible, and the server already replays them against an
authoritative copy rather than accepting whole documents. Needs a presence
channel and conflict resolution — most likely operational transform over the
existing op types rather than a general CRDT, since the ops are already
semantic.

**Image optimisation.** Ingestion probes dimensions but does not resize or
re-encode. A 4000px photo is stored at 4000px, which is wasteful for a hero that
renders at 1200. Needs a resize step — deliberately deferred because doing it
without a native dependency means `OffscreenCanvas` in the browser and something
else on the server, and that split deserves its own design.

**Comments.** Schema and threading are in place; no UI.

## Later

**Deploy integrations.** `IntegrationContribution` is the contribution point.
Vercel, Netlify and Cloudflare each need a token flow and a build trigger.
Deliberately left as plugins so the core does not grow vendor coupling.

**Figma import.** The AI import mode reconstructs from screenshots — now
reachable from the chat composer — and from pasted HTML. A real `.fig` parser is a substantial separate project; the
screenshot path covers most of the value in the meantime.

**Component instances.** `ComponentDef` and `overrides` are in the model, and
the AI can create reusable components, but instance/override propagation is not
implemented in the editor.

**Motion timeline.** Presets and the CSS engine work today, and the video target
now reads `MotionSpec` as real time. GSAP and Framer Motion are declared in the
spec and handled by exporters, but there is still no keyframe editor — motion is
chosen from presets rather than drawn.

## Not planned

**A proprietary runtime.** Exported code will keep having no OpenDesign
dependency. Anything that would require one belongs in a plugin.

**Design-file lock-in.** The document format is plain JSON with a published
schema. Import and export of that JSON will stay first-class.
