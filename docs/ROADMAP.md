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
- Plugin system with three worked examples and a contract test suite

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

**Asset pipeline.** `Asset` exists in the model and the schema, and the AI layer
generates alt text. There is no upload UI, no storage adapter and no image
optimisation yet.

**Comments.** Schema and threading are in place; no UI.

## Later

**Deploy integrations.** `IntegrationContribution` is the contribution point.
Vercel, Netlify and Cloudflare each need a token flow and a build trigger.
Deliberately left as plugins so the core does not grow vendor coupling.

**Figma import.** The AI import mode already reconstructs from screenshots and
pasted HTML. A real `.fig` parser is a substantial separate project; the
screenshot path covers most of the value in the meantime.

**Component instances.** `ComponentDef` and `overrides` are in the model, and
the AI can create reusable components, but instance/override propagation is not
implemented in the editor.

**Motion timeline.** Presets and the CSS engine work today. GSAP and Framer
Motion are declared in `MotionSpec` and handled by exporters, but there is no
keyframe editor.

## Not planned

**A proprietary runtime.** Exported code will keep having no OpenDesign
dependency. Anything that would require one belongs in a plugin.

**Design-file lock-in.** The document format is plain JSON with a published
schema. Import and export of that JSON will stay first-class.
